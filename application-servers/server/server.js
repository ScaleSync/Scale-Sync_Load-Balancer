
const express = require('express');
const { json } = require('express');
const { cpus: _cpus } = require('os');
const { argv } = require('node:process');
const cors = require('cors');

const app = express();
const port = argv[argv.length - 1];

app.use(cors());
app.use(json()); 

let activeConnections = 0;
let lastCpuTimes = _cpus().map((cpu) => cpu.times);


function simulateHeavyComputation() {
  const start = Date.now();
  const duration = 300 + 500 * Math.random();
  while (Date.now() - start < duration) {
    Math.random();
  }
}

function getCPUUsage() {
  const cpus = _cpus();
  let totalDiff = 0;
  let idleDiff = 0;

  cpus.forEach((cpu, index) => {
    const { user, nice, sys, idle, irq } = cpu.times;
    const last = lastCpuTimes[index];

    const total = user + nice + sys + idle + irq;
    const lastTotal = last.user + last.nice + last.sys + last.idle + last.irq;

    totalDiff += total - lastTotal;
    idleDiff += idle - last.idle;

    lastCpuTimes[index] = cpu.times;
  });

  const cpuUsage = totalDiff === 0 ? 0 : 100 - Math.floor((idleDiff / totalDiff) * 100);
  return cpuUsage;
}

const monitorCPUUsage = () => {
  setInterval(() => {
    const usage = getCPUUsage();
    // console.log(`Current CPU Usage: ${usage}% by [ server-${port} ]`);
  }, 5000);
};

app.get("/health", (req, res) => {
  res.status(200).json({ status: "Healthy" });
});

app.get("/cpuUsage", (req, res) => {
  const cpuUsage = getCPUUsage();

  res.status(200).json({ usage: cpuUsage });
});

let requestCounter = 0; 

app.post("/processRequest", (req, res) => {
  activeConnections++;
  const { data } = req.body;

  if (!data) {
      activeConnections--;
      return res.status(400).json({ message: "No data provided" });
  }

  let currentRequestNumber = activeConnections; 

  try {
      simulateHeavyComputation();
      
      res.status(200).json({
          message: `Processed request with data: ${JSON.stringify(data)}, Server: ${port}`,
          server: `Server-${port}`,
          requestNumber: activeConnections,
      });
  } catch (error) {
      console.error(`Error processing request on server ${port}:`, error);
      res.status(500).json({ message: "Internal Server Error", error: error.message });
  } finally {
      activeConnections--; 
  }
});


app.get("/requestsPerSecond", (req, res) => {
    res.status(200).json({ requestsPerSecond });
});

app.get("/activeConnections", (req, res) => {
  res.status(200).json({ activeConnections });
});


monitorCPUUsage();

app.listen(port, () => {
  console.log(`Application Server is listening at http://localhost:${port}`);
});
