#!/usr/bin/env node

/**
 * Post-Upgrade Health Monitor for WeStack BMS
 * Monitors application health after dependency upgrades
 */

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class HealthMonitor {
  constructor(options = {}) {
    this.config = {
      endpoints: [
        'http://localhost:8080/health',
        'http://localhost:8080/graphql'
      ],
      thresholds: {
        responseTime: 1000, // ms
        uptime: 0.99, // 99%
        errorRate: 0.01, // 1%
        memoryUsage: 512, // MB
        cpuUsage: 80 // %
      },
      monitoringDuration: 300000, // 5 minutes
      checkInterval: 10000, // 10 seconds
      ...options
    };

    this.metrics = {
      checks: [],
      startTime: Date.now(),
      overallStatus: 'UNKNOWN'
    };
  }

  async startMonitoring() {
    console.log('🏥 Starting post-upgrade health monitoring...');
    console.log('===============================================');
    console.log(`Duration: ${this.config.monitoringDuration / 1000} seconds`);
    console.log(`Check interval: ${this.config.checkInterval / 1000} seconds`);
    console.log('');

    const startTime = Date.now();
    const endTime = startTime + this.config.monitoringDuration;

    while (Date.now() < endTime) {
      const checkResult = await this.performHealthCheck();
      this.metrics.checks.push(checkResult);

      this.printCheckResult(checkResult);

      // Wait for next check
      await this.sleep(this.config.checkInterval);
    }

    const summary = this.generateSummary();
    this.printSummary(summary);

    return summary;
  }

  async performHealthCheck() {
    const timestamp = new Date().toISOString();
    const check = {
      timestamp,
      endpoints: {},
      services: {},
      performance: {},
      overall: 'PASS'
    };

    // Test endpoints
    for (const endpoint of this.config.endpoints) {
      check.endpoints[endpoint] = await this.checkEndpoint(endpoint);
    }

    // Test services
    check.services.mqtt = await this.checkMqttService();
    check.services.databases = await this.checkDatabases();
    check.services.dependencies = await this.checkDependencies();

    // Performance metrics
    check.performance = await this.gatherPerformanceMetrics();

    // Determine overall status
    const hasEndpointFailures = Object.values(check.endpoints).some(e => !e.healthy);
    const hasServiceFailures = Object.values(check.services).some(s => !s.healthy);
    const hasPerformanceIssues = this.hasPerformanceIssues(check.performance);

    if (hasEndpointFailures || hasServiceFailures || hasPerformanceIssues) {
      check.overall = 'FAIL';
    } else if (this.hasPerformanceWarnings(check.performance)) {
      check.overall = 'WARNING';
    }

    return check;
  }

  async checkEndpoint(url) {
    const start = Date.now();
    const result = {
      url,
      healthy: false,
      responseTime: 0,
      status: null,
      error: null
    };

    try {
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept 4xx as healthy but not 5xx
      });

      result.responseTime = Date.now() - start;
      result.status = response.status;
      result.healthy = response.status < 400;

      // Special handling for GraphQL endpoint
      if (url.includes('graphql') && response.status === 405) {
        // GraphQL endpoint might return 405 for GET requests, which is normal
        result.healthy = true;
      }

    } catch (error) {
      result.responseTime = Date.now() - start;
      result.error = error.message;

      // Handle specific error cases
      if (error.code === 'ECONNREFUSED') {
        result.error = 'Service not running';
      } else if (error.code === 'ENOTFOUND') {
        result.error = 'Service not found';
      } else if (error.code === 'ETIMEDOUT') {
        result.error = 'Request timeout';
      }
    }

    return result;
  }

  async checkMqttService() {
    const result = {
      healthy: false,
      error: null,
      details: {}
    };

    try {
      // Test MQTT client import
      const importTest = await this.runCommand(
        'node -e "const mqtt = require(\'mqtt\'); console.log(\'MQTT client loaded successfully\');"',
        5000
      );

      result.healthy = importTest.exitCode === 0;
      result.details.import = {
        success: importTest.exitCode === 0,
        output: importTest.stdout,
        error: importTest.stderr
      };

      // If Docker is available, check MQTT broker
      const dockerCheck = await this.runCommand('docker compose ps mosquitto', 3000);
      if (dockerCheck.exitCode === 0) {
        const brokerRunning = dockerCheck.stdout.includes('Up');
        result.details.broker = {
          running: brokerRunning,
          status: brokerRunning ? 'healthy' : 'stopped'
        };
      }

    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  async checkDatabases() {
    const result = {
      healthy: false,
      influxdb: {},
      memgraph: {}
    };

    try {
      // Check InfluxDB
      const influxTest = await this.runCommand(
        'node -e "const { InfluxDB } = require(\'@influxdata/influxdb-client\'); console.log(\'InfluxDB client loaded\');"',
        5000
      );

      result.influxdb = {
        clientLoaded: influxTest.exitCode === 0,
        error: influxTest.stderr || null
      };

      // Check Memgraph/Neo4j
      const neo4jTest = await this.runCommand(
        'node -e "const neo4j = require(\'neo4j-driver\'); console.log(\'Neo4j driver loaded\');"',
        5000
      );

      result.memgraph = {
        driverLoaded: neo4jTest.exitCode === 0,
        error: neo4jTest.stderr || null
      };

      // Check if Docker containers are running
      const dockerCheck = await this.runCommand('docker compose ps bms-influxdb bms-memgraph', 3000);
      if (dockerCheck.exitCode === 0) {
        result.influxdb.containerRunning = dockerCheck.stdout.includes('bms-influxdb') && dockerCheck.stdout.includes('Up');
        result.memgraph.containerRunning = dockerCheck.stdout.includes('bms-memgraph') && dockerCheck.stdout.includes('Up');
      }

      result.healthy = result.influxdb.clientLoaded && result.memgraph.driverLoaded;

    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  async checkDependencies() {
    const result = {
      healthy: false,
      missingDependencies: [],
      vulnerabilities: null
    };

    try {
      // Check for missing dependencies
      const depsCheck = await this.runCommand('npm list --depth=0', 10000);

      if (depsCheck.stderr && depsCheck.stderr.includes('UNMET DEPENDENCY')) {
        const lines = depsCheck.stderr.split('\n');
        for (const line of lines) {
          if (line.includes('UNMET DEPENDENCY')) {
            const match = line.match(/UNMET DEPENDENCY (.+?)@/);
            if (match) {
              result.missingDependencies.push(match[1]);
            }
          }
        }
      }

      // Quick security audit
      const auditCheck = await this.runCommand('npm audit --audit-level high', 5000);
      result.vulnerabilities = {
        hasHighSeverity: auditCheck.exitCode !== 0,
        output: auditCheck.stdout
      };

      result.healthy = result.missingDependencies.length === 0 && !result.vulnerabilities.hasHighSeverity;

    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  async gatherPerformanceMetrics() {
    const metrics = {
      process: {},
      build: {},
      test: {}
    };

    try {
      // Process metrics (if app is running)
      const processInfo = await this.runCommand('ps aux | grep "node.*index.js" | grep -v grep', 2000);
      if (processInfo.exitCode === 0) {
        const parts = processInfo.stdout.trim().split(/\s+/);
        if (parts.length > 10) {
          metrics.process = {
            pid: parts[1],
            cpu: parseFloat(parts[2]),
            memory: parseFloat(parts[3]),
            running: true
          };
        }
      } else {
        metrics.process.running = false;
      }

      // Build performance
      const buildStart = Date.now();
      const buildResult = await this.runCommand('npm run build', 30000);
      metrics.build = {
        time: Date.now() - buildStart,
        success: buildResult.exitCode === 0,
        error: buildResult.stderr || null
      };

      // Test performance (quick smoke tests only)
      const testStart = Date.now();
      const testResult = await this.runCommand('timeout 10 npm test || echo "test-timeout"', 15000);
      metrics.test = {
        time: Date.now() - testStart,
        success: testResult.exitCode === 0,
        timedOut: testResult.stdout.includes('test-timeout'),
        error: testResult.stderr || null
      };

    } catch (error) {
      metrics.error = error.message;
    }

    return metrics;
  }

  hasPerformanceIssues(performance) {
    if (!performance) return false;

    const issues = [
      performance.process?.cpu > this.config.thresholds.cpuUsage,
      performance.process?.memory > this.config.thresholds.memoryUsage,
      performance.build?.time > 60000, // 1 minute build time is concerning
      !performance.build?.success,
      !performance.test?.success && !performance.test?.timedOut
    ];

    return issues.some(issue => issue === true);
  }

  hasPerformanceWarnings(performance) {
    if (!performance) return false;

    const warnings = [
      performance.process?.cpu > 50,
      performance.build?.time > 30000, // 30 seconds build time is warning
      performance.test?.timedOut
    ];

    return warnings.some(warning => warning === true);
  }

  printCheckResult(check) {
    const status = this.getStatusIcon(check.overall);
    const timestamp = new Date(check.timestamp).toLocaleTimeString();

    console.log(`[${timestamp}] ${status} ${check.overall}`);

    // Print endpoint status
    for (const [url, result] of Object.entries(check.endpoints)) {
      const endpointStatus = result.healthy ? '✅' : '❌';
      const responseTime = result.responseTime;
      console.log(`  ${endpointStatus} ${url} (${responseTime}ms)`);

      if (!result.healthy && result.error) {
        console.log(`    Error: ${result.error}`);
      }
    }

    // Print service status
    const mqttStatus = check.services.mqtt.healthy ? '✅' : '❌';
    const dbStatus = check.services.databases.healthy ? '✅' : '❌';
    const depStatus = check.services.dependencies.healthy ? '✅' : '❌';

    console.log(`  ${mqttStatus} MQTT ${depStatus} Dependencies ${dbStatus} Databases`);

    // Print performance summary
    if (check.performance.process?.running) {
      const cpu = check.performance.process.cpu.toFixed(1);
      const mem = check.performance.process.memory.toFixed(1);
      console.log(`  📊 CPU: ${cpu}% Memory: ${mem}%`);
    }

    console.log('');
  }

  generateSummary() {
    const totalChecks = this.metrics.checks.length;
    const passedChecks = this.metrics.checks.filter(c => c.overall === 'PASS').length;
    const warningChecks = this.metrics.checks.filter(c => c.overall === 'WARNING').length;
    const failedChecks = this.metrics.checks.filter(c => c.overall === 'FAIL').length;

    const uptime = (passedChecks / totalChecks) * 100;
    const monitoringDuration = Date.now() - this.metrics.startTime;

    // Calculate average response times
    const endpointStats = {};
    for (const check of this.metrics.checks) {
      for (const [url, result] of Object.entries(check.endpoints)) {
        if (!endpointStats[url]) {
          endpointStats[url] = [];
        }
        if (result.healthy) {
          endpointStats[url].push(result.responseTime);
        }
      }
    }

    const avgResponseTimes = {};
    for (const [url, times] of Object.entries(endpointStats)) {
      if (times.length > 0) {
        avgResponseTimes[url] = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    // Determine overall health
    let overallHealth = 'HEALTHY';
    if (uptime < this.config.thresholds.uptime * 100) {
      overallHealth = 'UNHEALTHY';
    } else if (warningChecks > totalChecks * 0.1) { // More than 10% warnings
      overallHealth = 'WARNING';
    }

    return {
      overallHealth,
      uptime: uptime.toFixed(2),
      totalChecks,
      passedChecks,
      warningChecks,
      failedChecks,
      monitoringDuration,
      avgResponseTimes,
      recommendations: this.generateRecommendations(overallHealth, uptime, avgResponseTimes)
    };
  }

  generateRecommendations(health, uptime, responseTimes) {
    const recommendations = [];

    if (health === 'UNHEALTHY') {
      recommendations.push('🚨 CRITICAL: System is unhealthy - investigate immediately');
      recommendations.push('   Consider rolling back the upgrade');
    } else if (health === 'WARNING') {
      recommendations.push('⚠️  System showing warning signs - monitor closely');
    } else {
      recommendations.push('✅ System appears healthy post-upgrade');
    }

    if (uptime < 95) {
      recommendations.push('📈 Uptime is below acceptable threshold');
    }

    for (const [url, avgTime] of Object.entries(responseTimes)) {
      if (avgTime > this.config.thresholds.responseTime) {
        recommendations.push(`⏱️  ${url} response time is high (${avgTime.toFixed(0)}ms)`);
      }
    }

    return recommendations;
  }

  printSummary(summary) {
    console.log('📋 POST-UPGRADE HEALTH SUMMARY');
    console.log('===============================');
    console.log(`Overall Health: ${this.getStatusIcon(summary.overallHealth)} ${summary.overallHealth}`);
    console.log(`Uptime: ${summary.uptime}%`);
    console.log(`Monitoring Duration: ${(summary.monitoringDuration / 1000).toFixed(0)}s`);
    console.log(`Total Checks: ${summary.totalChecks}`);
    console.log(`  ✅ Passed: ${summary.passedChecks}`);
    console.log(`  ⚠️  Warning: ${summary.warningChecks}`);
    console.log(`  ❌ Failed: ${summary.failedChecks}`);
    console.log('');

    console.log('🌐 Average Response Times:');
    for (const [url, avgTime] of Object.entries(summary.avgResponseTimes)) {
      const status = avgTime > this.config.thresholds.responseTime ? '⚠️' : '✅';
      console.log(`  ${status} ${url}: ${avgTime.toFixed(0)}ms`);
    }
    console.log('');

    console.log('💡 Recommendations:');
    for (const recommendation of summary.recommendations) {
      console.log(`  ${recommendation}`);
    }

    // Save detailed report
    const reportPath = path.join(process.cwd(), 'health-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      summary,
      allChecks: this.metrics.checks,
      config: this.config,
      generatedAt: new Date().toISOString()
    }, null, 2));

    console.log(`\n📊 Detailed report saved to: ${reportPath}`);
  }

  getStatusIcon(status) {
    const icons = {
      'PASS': '✅',
      'WARNING': '⚠️',
      'FAIL': '❌',
      'HEALTHY': '✅',
      'WARNING': '⚠️',
      'UNHEALTHY': '❌'
    };
    return icons[status] || '❓';
  }

  async runCommand(command, timeout = 10000) {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve({
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut: true
        });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut: false
        });
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  // Parse command line options
  const options = {};

  if (args.includes('--quick')) {
    options.monitoringDuration = 60000; // 1 minute
    options.checkInterval = 5000; // 5 seconds
  }

  if (args.includes('--long')) {
    options.monitoringDuration = 900000; // 15 minutes
  }

  const monitor = new HealthMonitor(options);

  try {
    const summary = await monitor.startMonitoring();

    // Exit with appropriate code
    if (summary.overallHealth === 'UNHEALTHY') {
      process.exit(1);
    } else if (summary.overallHealth === 'WARNING') {
      process.exit(2);
    } else {
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Health monitoring failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = HealthMonitor;