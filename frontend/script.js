const NUMBER_OF_REQUESTS = 100000;
const DELAY_BETWEEN_REQUESTS = 50; 

const loadBalancers = [
    { id: 'load-balancer-1', url: 'http://localhost:4001' },
    { id: 'load-balancer-2', url: 'http://localhost:4002' },
];

let healthyLBs = [];
let currentLBIndex = 0;

async function checkLoadBalancerHealth() {
    const newHealthyLBs = [];

    await Promise.all(loadBalancers.map(async (lb) => {

        try {
            const response = await fetch(`${lb.url}/health`);
            if (response.ok)
            {
                newHealthyLBs.push(lb)
            }else {
                console.log(`Load Balancer ${lb.id} is down:`)
            }
        } catch (error) {
            console.log(`Load Balancer ${lb.id} is down:`, error);
        }

    }));

    healthyLBs = newHealthyLBs;
    document.getElementById('sendRequestButton').disabled = healthyLBs.length === 0;

    if(healthyLBs.length == 0){
        window.alert("Load balancers are down")
    }
}

function startHealthCheck() {
    checkLoadBalancerHealth(); 
    setInterval(checkLoadBalancerHealth, 600000); 
}

function getNextLoadBalancer() {
    if (healthyLBs.length === 0) 
        throw new Error('No healthy load balancers available.');
    const lb = healthyLBs[currentLBIndex];
    currentLBIndex = (currentLBIndex + 1) % healthyLBs.length; 
    return lb;
}

async function sendSingleRequest(selectedLB) {
    const requestData = { data: `Request data at ${new Date().toISOString()}` };

    const response = await fetch(`${selectedLB.url}/sendRequest`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });

    if (!response.ok) throw new Error('Network response was not ok: ' + response.statusText);
    
    return await response.json();
}


async function sendMultipleRequests(numberOfRequests, delay = 0) {
    const responseDiv = document.getElementById('responseMessage');

    for (let i = 0; i < numberOfRequests; i++) {
        const selectedLB = getNextLoadBalancer();

        
        sendSingleRequest(selectedLB)
            .then((result) => {
               
                const message = `${result.message}`;
                responseDiv.innerHTML +=  message + '<br>'; 
            })
            .catch((error) => {
                console.error('Error:', error);
                responseDiv.innerHTML += `Request ${i + 1}: Error - ${error.message}<br>`;
            });

        
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay + 10 * Math.random()));
        }
    }
}

document.getElementById('sendRequestButton').addEventListener('click', async () => {

    document.getElementById('responseMessage').innerHTML = '';

    await sendMultipleRequests(NUMBER_OF_REQUESTS, DELAY_BETWEEN_REQUESTS);
});

startHealthCheck();


//OLD CODE

// const loadBalancers = [
//     { id: 'load-balancer-1', url: 'http://localhost:4001' },
//     { id: 'load-balancer-2', url: 'http://localhost:4002' },
//     // { id: 'load-balancer-3', url: 'http://localhost:4003' }
// ];

// let healthyLBs = [];
// let currentLBIndex = 0;

// async function checkLoadBalancerHealth() {
//     const newHealthyLBs = [];

//     await Promise.all(loadBalancers.map(async (lb) => {
//         try {
//             const response = await fetch(`${lb.url}/health`);
//             if (response.ok) newHealthyLBs.push(lb);
//         } catch (error) {
//             console.error(`Load Balancer ${lb.id} is down:`, error);
//         }
//     }));

//     healthyLBs = newHealthyLBs;
//     document.getElementById('sendRequestButton').disabled = healthyLBs.length === 0;
// }

// function startHealthCheck() {
//     checkLoadBalancerHealth(); // Initial check
//     setInterval(checkLoadBalancerHealth, 600000); // Check every 10min
// }

// function getNextLoadBalancer() {
//     if (healthyLBs.length === 0) throw new Error('No healthy load balancers available.');
//     const lb = healthyLBs[currentLBIndex];
//     currentLBIndex = (currentLBIndex + 1) % healthyLBs.length; 
//     return lb;
// }

// document.getElementById('sendRequestButton').addEventListener('click', async () => {
//     const responseDiv = document.getElementById('responseMessage');

//     try {
//         const selectedLB = getNextLoadBalancer(); 

//         const requestData = { data: `Request data at ${new Date().toISOString()}` };

//         const response = await fetch(`${selectedLB.url}/sendRequest`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify(requestData)
//         });

//         if (!response.ok) throw new Error('Network response was not ok: ' + response.statusText);

//         const data = await response.json();
//         responseDiv.textContent = data.message; 
//     } catch (error) {
//         console.error('Error:', error);
//         responseDiv.textContent = 'Error sending request: ' + error.message;
//     }
// });

// startHealthCheck();
