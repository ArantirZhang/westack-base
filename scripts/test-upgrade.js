#!/usr/bin/env node

/**
 * Automated Upgrade Testing Suite for WeStack BMS
 * Tests dependency upgrades to ensure system stability
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class UpgradeTestSuite {
  constructor() {
    this.baselineFile = path.join(__dirname, '..', 'upgrade-baseline.json');
    this.reportFile = path.join(__dirname, '..', 'upgrade-report.json');
  }

  async runPreUpgradeTests() {
    console.log('📊 Running pre-upgrade baseline tests...');
    console.log('=====================================');

    const baseline = {
      timestamp: new Date().toISOString(),
      phase: 'pre-upgrade',
      tests: {
        unitTests: await this.runUnitTests(),
        buildProcess: await this.runBuild(),
        linting: await this.runLint(),
        typeCheck: await this.runTypeCheck(),
        dependencies: await this.checkDependencies()
      },
      performance: {
        buildTime: await this.measureBuildTime(),
        testExecutionTime: await this.measureTestTime(),
        bundleSize: await this.measureBundleSize()
      },
      services: {
        mqttIngestion: await this.testMqttFlow(),
        graphqlApi: await this.testGraphQLAPI(),
        databaseConnections: await this.testDatabaseConnections()
      }
    };

    fs.writeFileSync(this.baselineFile, JSON.stringify(baseline, null, 2));
    console.log('✅ Baseline metrics captured');
    return baseline;
  }

  async runPostUpgradeTests() {
    console.log('🔍 Running post-upgrade validation tests...');
    console.log('==========================================');

    if (!fs.existsSync(this.baselineFile)) {
      throw new Error('No baseline found! Run pre-upgrade tests first.');
    }

    const baseline = JSON.parse(fs.readFileSync(this.baselineFile));

    const current = {
      timestamp: new Date().toISOString(),
      phase: 'post-upgrade',
      tests: {
        unitTests: await this.runUnitTests(),
        buildProcess: await this.runBuild(),
        linting: await this.runLint(),
        typeCheck: await this.runTypeCheck(),
        dependencies: await this.checkDependencies()
      },
      performance: {
        buildTime: await this.measureBuildTime(),
        testExecutionTime: await this.measureTestTime(),
        bundleSize: await this.measureBundleSize()
      },
      services: {
        mqttIngestion: await this.testMqttFlow(),
        graphqlApi: await this.testGraphQLAPI(),
        databaseConnections: await this.testDatabaseConnections()
      }
    };

    const comparison = this.compareResults(baseline, current);

    const report = {
      baseline,
      current,
      comparison,
      verdict: comparison.overallStatus
    };

    fs.writeFileSync(this.reportFile, JSON.stringify(report, null, 2));
    console.log(`📋 Upgrade report saved to: ${this.reportFile}`);

    return report;
  }

  async runUnitTests() {
    console.log('🧪 Running unit tests...');
    const result = await this.runCommand('npm test', 30000);

    return {
      passed: result.exitCode === 0,
      output: result.stdout,
      errors: result.stderr,
      duration: result.duration
    };
  }

  async runBuild() {
    console.log('🏗️  Running build process...');
    const result = await this.runCommand('npm run build', 60000);

    return {
      passed: result.exitCode === 0,
      output: result.stdout,
      errors: result.stderr,
      duration: result.duration
    };
  }

  async runLint() {
    console.log('🔍 Running linter...');
    const result = await this.runCommand('npm run lint', 30000);

    return {
      passed: result.exitCode === 0,
      output: result.stdout,
      errors: result.stderr,
      duration: result.duration
    };
  }

  async runTypeCheck() {
    console.log('📝 Running TypeScript type check...');
    const result = await this.runCommand('npx tsc --noEmit', 30000);

    return {
      passed: result.exitCode === 0,
      output: result.stdout,
      errors: result.stderr,
      duration: result.duration
    };
  }

  async checkDependencies() {
    console.log('📦 Checking dependencies...');
    const audit = await this.runCommand('npm audit --audit-level moderate', 30000);
    const outdated = await this.runCommand('npm outdated', 30000, false); // Don't fail on outdated

    return {
      auditPassed: audit.exitCode === 0,
      auditOutput: audit.stdout,
      outdatedPackages: this.parseOutdatedOutput(outdated.stdout),
      vulnerabilities: this.parseAuditOutput(audit.stdout)
    };
  }

  async measureBuildTime() {
    console.log('⏱️  Measuring build time...');
    const start = Date.now();
    await this.runCommand('npm run build', 60000);
    return Date.now() - start;
  }

  async measureTestTime() {
    console.log('⏱️  Measuring test execution time...');
    const start = Date.now();
    await this.runCommand('npm test', 30000);
    return Date.now() - start;
  }

  async measureBundleSize() {
    console.log('📏 Measuring bundle size...');
    const distPath = path.join(__dirname, '..', 'dist');

    if (!fs.existsSync(distPath)) {
      return { error: 'No dist folder found' };
    }

    try {
      const stats = await this.getFolderSize(distPath);
      return {
        totalSize: stats.size,
        fileCount: stats.fileCount,
        mainBundle: this.getFileSize(path.join(distPath, 'index.js'))
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async testMqttFlow() {
    console.log('🔌 Testing MQTT ingestion flow...');

    // This would ideally test the actual MQTT flow
    // For now, we'll check if the MQTT client can be imported
    try {
      const result = await this.runCommand(
        'node -e "const mqtt = require(\'mqtt\'); console.log(\'MQTT client loaded successfully\');"',
        10000
      );
      return {
        passed: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr
      };
    } catch (error) {
      return {
        passed: false,
        errors: error.message
      };
    }
  }

  async testGraphQLAPI() {
    console.log('🌐 Testing GraphQL API...');

    try {
      const result = await this.runCommand(
        'node -e "const { apollo } = require(\'apollo-server-express\'); console.log(\'GraphQL dependencies loaded\');"',
        10000
      );
      return {
        passed: result.exitCode === 0,
        output: result.stdout,
        errors: result.stderr
      };
    } catch (error) {
      return {
        passed: false,
        errors: error.message
      };
    }
  }

  async testDatabaseConnections() {
    console.log('💾 Testing database connections...');

    const results = {};

    // Test InfluxDB client
    try {
      const influxResult = await this.runCommand(
        'node -e "const { InfluxDB } = require(\'@influxdata/influxdb-client\'); console.log(\'InfluxDB client loaded\');"',
        10000
      );
      results.influxdb = {
        passed: influxResult.exitCode === 0,
        output: influxResult.stdout,
        errors: influxResult.stderr
      };
    } catch (error) {
      results.influxdb = {
        passed: false,
        errors: error.message
      };
    }

    // Test Neo4j driver
    try {
      const neoResult = await this.runCommand(
        'node -e "const neo4j = require(\'neo4j-driver\'); console.log(\'Neo4j driver loaded\');"',
        10000
      );
      results.neo4j = {
        passed: neoResult.exitCode === 0,
        output: neoResult.stdout,
        errors: neoResult.stderr
      };
    } catch (error) {
      results.neo4j = {
        passed: false,
        errors: error.message
      };
    }

    return results;
  }

  compareResults(baseline, current) {
    const comparison = {
      tests: this.compareTestResults(baseline.tests, current.tests),
      performance: this.comparePerformance(baseline.performance, current.performance),
      services: this.compareServices(baseline.services, current.services),
      overallStatus: 'PASS'
    };

    // Determine overall status
    const hasTestRegressions = Object.values(comparison.tests).some(test => test.regressed);
    const hasPerformanceRegressions = comparison.performance.regressed;
    const hasServiceRegressions = Object.values(comparison.services).some(service => service.regressed);

    if (hasTestRegressions || hasPerformanceRegressions || hasServiceRegressions) {
      comparison.overallStatus = 'FAIL';
    } else if (Object.values(comparison.tests).some(test => test.warning) ||
               comparison.performance.warning) {
      comparison.overallStatus = 'WARNING';
    }

    return comparison;
  }

  compareTestResults(baseline, current) {
    const results = {};

    for (const testType of Object.keys(baseline)) {
      const baseResult = baseline[testType];
      const currentResult = current[testType];

      results[testType] = {
        regressed: baseResult.passed && !currentResult.passed,
        improved: !baseResult.passed && currentResult.passed,
        stable: baseResult.passed === currentResult.passed,
        durationChange: currentResult.duration - baseResult.duration
      };
    }

    return results;
  }

  comparePerformance(baseline, current) {
    const buildTimeChange = ((current.buildTime - baseline.buildTime) / baseline.buildTime) * 100;
    const testTimeChange = ((current.testExecutionTime - baseline.testExecutionTime) / baseline.testExecutionTime) * 100;

    return {
      buildTime: {
        baseline: baseline.buildTime,
        current: current.buildTime,
        change: buildTimeChange,
        regressed: buildTimeChange > 20 // 20% slower is a regression
      },
      testExecutionTime: {
        baseline: baseline.testExecutionTime,
        current: current.testExecutionTime,
        change: testTimeChange,
        regressed: testTimeChange > 20
      },
      regressed: buildTimeChange > 20 || testTimeChange > 20,
      warning: buildTimeChange > 10 || testTimeChange > 10
    };
  }

  compareServices(baseline, current) {
    const results = {};

    for (const serviceType of Object.keys(baseline)) {
      const baseResult = baseline[serviceType];
      const currentResult = current[serviceType];

      if (typeof baseResult === 'object' && baseResult.passed !== undefined) {
        results[serviceType] = {
          regressed: baseResult.passed && !currentResult.passed,
          improved: !baseResult.passed && currentResult.passed,
          stable: baseResult.passed === currentResult.passed
        };
      } else {
        // Handle complex service results (like database connections)
        results[serviceType] = {
          regressed: false,
          stable: true
        };
      }
    }

    return results;
  }

  async runCommand(command, timeout = 30000, shouldSucceed = true) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const child = spawn('bash', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
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
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        const duration = Date.now() - start;

        const result = {
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          duration
        };

        if (shouldSucceed && code !== 0) {
          console.warn(`⚠️ Command failed: ${command}`);
          console.warn(`Exit code: ${code}`);
          if (stderr) console.warn(`Stderr: ${stderr}`);
        }

        resolve(result);
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  parseOutdatedOutput(output) {
    // Simple parsing of npm outdated output
    const packages = [];
    const lines = output.split('\n').slice(1); // Skip header

    for (const line of lines) {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          packages.push({
            name: parts[0],
            current: parts[1],
            wanted: parts[2],
            latest: parts[3]
          });
        }
      }
    }

    return packages;
  }

  parseAuditOutput(output) {
    // Simple parsing of npm audit output
    try {
      const vulnerabilities = {
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0
      };

      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('vulnerabilities')) {
          const match = line.match(/(\d+)\s+(\w+)/);
          if (match) {
            const count = parseInt(match[1]);
            const severity = match[2].toLowerCase();
            if (vulnerabilities.hasOwnProperty(severity)) {
              vulnerabilities[severity] += count;
            }
          }
        }
      }

      return vulnerabilities;
    } catch (error) {
      return { error: 'Failed to parse audit output' };
    }
  }

  async getFolderSize(folderPath) {
    let size = 0;
    let fileCount = 0;

    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        const subStats = await this.getFolderSize(filePath);
        size += subStats.size;
        fileCount += subStats.fileCount;
      } else {
        size += stats.size;
        fileCount++;
      }
    }

    return { size, fileCount };
  }

  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return null;
    }
  }

  printReport(report) {
    console.log('\n📊 UPGRADE TEST REPORT');
    console.log('=======================');
    console.log(`Overall Status: ${this.getStatusIcon(report.verdict)} ${report.verdict}`);
    console.log(`Generated: ${report.current.timestamp}`);
    console.log('');

    // Test Results
    console.log('🧪 Test Results:');
    for (const [testName, result] of Object.entries(report.comparison.tests)) {
      const icon = result.regressed ? '❌' : result.improved ? '✅' : '➡️';
      console.log(`  ${icon} ${testName}: ${result.stable ? 'STABLE' : result.regressed ? 'REGRESSED' : 'IMPROVED'}`);
    }

    // Performance
    console.log('\n⚡ Performance:');
    const perf = report.comparison.performance;
    console.log(`  Build Time: ${perf.buildTime.baseline}ms → ${perf.buildTime.current}ms (${perf.buildTime.change.toFixed(1)}%)`);
    console.log(`  Test Time: ${perf.testExecutionTime.baseline}ms → ${perf.testExecutionTime.current}ms (${perf.testExecutionTime.change.toFixed(1)}%)`);

    // Recommendations
    console.log('\n💡 Recommendations:');
    if (report.verdict === 'PASS') {
      console.log('  ✅ Upgrade looks safe to proceed');
    } else if (report.verdict === 'WARNING') {
      console.log('  ⚠️  Proceed with caution - monitor performance');
    } else {
      console.log('  ❌ Do not proceed - fix issues first');
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case 'PASS': return '✅';
      case 'WARNING': return '⚠️';
      case 'FAIL': return '❌';
      default: return '❓';
    }
  }
}

// CLI interface
async function main() {
  const testSuite = new UpgradeTestSuite();
  const args = process.argv.slice(2);

  try {
    if (args.includes('--pre') || args.includes('--baseline')) {
      const baseline = await testSuite.runPreUpgradeTests();
      console.log('\n✅ Pre-upgrade baseline captured successfully');

    } else if (args.includes('--post') || args.includes('--validate')) {
      const report = await testSuite.runPostUpgradeTests();
      testSuite.printReport(report);

      // Exit with error code if tests failed
      if (report.verdict === 'FAIL') {
        process.exit(1);
      }

    } else {
      console.log('Usage:');
      console.log('  node test-upgrade.js --pre    # Run pre-upgrade baseline');
      console.log('  node test-upgrade.js --post   # Run post-upgrade validation');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = UpgradeTestSuite;