const express = require("express");
const cors = require("cors");
const { get, post } = require("axios");
const { readFileSync } = require("fs");

const app = express();
const port = 4001;
app.use(cors());

let algorithm = "Round Robin";

const connectionsCount = {};
const responseTime = {};

try {
    const configData = readFileSync("./config.json");
    const config = JSON.parse(configData);
    algorithm = config.algorithm || algorithm;
    highUsageThreshold = config.highUsageThreshold;
    lowUsageThreshold = config.lowUsageThreshold;
    minPrimaryServers = config.minPrimaryServers;
    console.log(`Using load balancing algorithm: ${algorithm}`);
} catch (error) {
    console.error("Error reading config file:", error);
}

//From config.json
const HIGH_USAGE_THRESHOLD = highUsageThreshold || 75; 
const LOW_USAGE_THRESHOLD = lowUsageThreshold || 25;
const MIN_PRIMARY_SERVERS = minPrimaryServers || 4; 

let primaryServers = [
    "http://localhost:8001",
    "http://localhost:8002",
    "http://localhost:8003",
    "http://localhost:8004",
    "http://localhost:8005",
];

let scalingServers = [
    "http://localhost:8006",
    "http://localhost:8007",
    // "http://localhost:8008",
    // "http://localhost:8009",
    // "http://localhost:8010",
];

let roundRobinIndex = 0; 


app.use(express.json());

// Route to check health of this load balancer
app.get("/health", (req, res) => {
    res.status(200).json({ status: "Healthy" });
});


const checkServerHealth = async () => {
    const healthPromises = [...primaryServers, ...scalingServers].map(async (server) => {
        try {
            const response = await get(`${server}/health`);
            return { url: server, healthy: response.data.status === "Healthy" };
        } catch (error) {
            console.error(`Server-${server} is down...: ${error.message}`);
            return { url: server, healthy: false };
        }
    });
    
    const results = await Promise.allSettled(healthPromises);
    return results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            console.error(`Health check failed for: ${healthPromises[index].url}`);
            return { url: healthPromises[index].url, healthy: false };
        }
    });
};


const monitorCPUUsage = async () => {
    const serverUsages = await Promise.all(
        primaryServers.map(async (server) => {
            try {
                const usageResponse = await get(`${server}/cpuUsage`);
                return { url: server, usage: usageResponse.data.usage };
            } catch (error) {
                console.error(`Error fetching CPU usage for ${server}: ${error.message}`);
                return { url: server, usage: 0 }; 
            }
        })
    );

    serverUsages.forEach(({ url, usage }) => {
        
        if (usage > HIGH_USAGE_THRESHOLD) {
            console.log(`High usage detected on ${url}. Scaling up.`);
            scaleUpServer();
        }
        
        else if (usage < LOW_USAGE_THRESHOLD) {
            console.log(`Low usage detected on ${url}. Scaling down.`);
            scaleDownServer(url);
        }
    });
};


const scaleUpServer = () => {
    const scalingServer = scalingServers.pop();
    if (scalingServer) {
        primaryServers.push(scalingServer);
        console.log(`Scaled up: Moved ${scalingServer} to primary servers.`);
    } else {
        console.log("No available scaling servers to add.");
    }
};


const scaleDownServer = (serverUrl) => {
    const index = primaryServers.indexOf(serverUrl);
    if (index > -1 && primaryServers.length > MIN_PRIMARY_SERVERS) {
        primaryServers.splice(index, 1);
        scalingServers.push(serverUrl);
        console.log(`Scaled down: Moved ${serverUrl} to scaling servers.`);
    } else {
        console.log(`Cannot scale down ${serverUrl}, minimum primary servers limit reached.`);
    }
};


const fetchRequestsPerSecond = async () => {
    const requestCounts = await Promise.all(
        primaryServers.map(async (server) => {
            try {
                const response = await get(`${server}/requestsPerSecond`);
                return { server, requestsPerSecond: response.data.requestsPerSecond };
            } catch (error) {
                console.error(`Error fetching requests per second from ${server}:`, error.message);
                return { server, requestsPerSecond: 0 };
            }
        })
    );
    return requestCounts;
};

// Route to get request counts 
app.get('/requestsData', async (req, res) => {
    const requestCounts = await fetchRequestsPerSecond();
    res.status(200).json({ requestCounts });
});

// Main route to pass the request to any server based on algorithm
app.post("/sendRequest", async (req, res) => {

    if (!algorithm) return res.status(400).json({ message: "Load balancing algorithm not set" });

    const healthyServers = await checkServerHealth();

    const servers = healthyServers.filter((server) => server.healthy).map((server) => server.url);

    if (servers.length === 0) {
        return res.status(503).json({ message: "No healthy servers available" });
    }

    let selectedServer;

    switch (algorithm) {
        case "Round Robin":
            selectedServer = servers[roundRobinIndex % servers.length];
            roundRobinIndex++;
            break;

        case "Least Connections":
            selectedServer = servers.reduce((prev, curr) => {
                connectionsCount[curr] = connectionsCount[curr] || 0;
                return connectionsCount[prev] < connectionsCount[curr] ? prev : curr;
            });
            connectionsCount[selectedServer]++;
            break;

        case "Least Response Time":
            selectedServer = servers.reduce((prev, curr) => {
                responseTime[curr] = responseTime[curr] || 0;
                return responseTime[prev] < responseTime[curr] ? prev : curr;
            });
            break;

        case "Dynamic":
            try {
                const serverData = await Promise.all(
                    servers.map(async (curr) => {
                        const cpuUsageResponse = await get(`${curr}/cpuUsage`);
                        const cpuUsage = cpuUsageResponse.data.usage;
                        connectionsCount[curr] = connectionsCount[curr] || 0;
                        responseTime[curr] = responseTime[curr] || 0;
                        const score = cpuUsage / 100 + connectionsCount[curr] / 10 + responseTime[curr] / 1000;
                        return { server: curr, score };
                    })
                );
                const selected = serverData.reduce((prev, curr) => (curr.score < prev.score ? curr : prev));
                selectedServer = selected.server;
            } catch (error) {
                console.error("Error calculating dynamic score:", error.message);
                return res.status(500).json({ message: "Error calculating dynamic algorithm" });
            }
            break;

        default:
            return res.status(400).json({ message: "Invalid algorithm specified" });
    }

    try {
        const startTime = Date.now();
        connectionsCount[selectedServer] = (connectionsCount[selectedServer] || 0) + 1;

        const response = await post(`${selectedServer}/processRequest`, {
            data: req.body.data,
            algorithm,
        });

        const endTime = Date.now();
        const elapsedTime = endTime - startTime; 
        responseTime[selectedServer] = elapsedTime; 
        connectionsCount[selectedServer]--;

       
        console.log(`Request processed with data: ${req.body.data}, Server: ${selectedServer.split(':')[2]}, Response Time: ${elapsedTime}ms`);

        
        res.status(200).json({
            ...response.data,
            selectedServer: selectedServer,
        });
    } catch (error) {
        console.error(`Error processing request to ${selectedServer}: ${error.message}`);
        connectionsCount[selectedServer]--;
        res.status(500).json({
            message: "Error processing request",
            error: error.message,
            selectedServer: selectedServer,
        });
    }
});



app.get('/metrics', async (req, res) => {
    const metrics = {
        cpuUsages: {}, 
        requestCounts: {}, 
    };

    const metricPromises = primaryServers.map(async (server) => {
        try {
            const cpuUsageResponse = await get(`${server}/cpuUsage`);
            // const cpuReqCount = await get(`${server}/activeConnections`)
            metrics.cpuUsages[server] = cpuUsageResponse.data.usage; 
            // metrics.requestCounts[server] = cpuReqCount.data.activeConnections; 
            metrics.requestCounts[server] = connectionsCount[server] || 0;
            // console.log(metrics);
        } catch (error) {
            console.error(`Error fetching metrics from ${server}:`, error.message);
        }
    });

    await Promise.all(metricPromises); 
    res.status(200).json(metrics);
});



setInterval(() => {
    monitorCPUUsage();
}, 500); 

setInterval(() => {
    checkServerHealth();
}, 30000); 


app.listen(port, () => {
    console.log(`Load Balancer is listening at http://localhost:${port}`);
});
