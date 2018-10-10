const fs = require('fs');
const xml2js = require('xml2js');

const parser = new xml2js.Parser();

// Grab the command options
const args = process.argv.slice(2);
const numGroups = +args[args.indexOf('--num-groups') + 1];
const runningAvgLength = +args[args.indexOf('--running-avg-length') + 1];

// Load the junit results from the various groups on this build
const currentBuildResults = [];
for (let i = 0; i < numGroups; i++) {
  const data = fs.readFileSync(`../../tmp/results/junit/${i}.xml`);
  parser.parseString(data, (err, { testsuites: { testsuite } }) => {
    (testsuite || [])
      .map(testsuite => testsuite.testcase)
      .forEach((testcase = []) =>
        testcase.forEach(({ $: { name, time } }) => {
          currentBuildResults.push({ name, time: +time })
        })
      );
  });
}

// Try to load previous test balance
let previousBuildResults = [];
try {
  previousBuildResults = 
    JSON.parse(fs.readFileSync(`../../tmp/test-groups/data.json`));
} catch (err) {
  console.log([
    'No historical data found! Perhaps the test groups cache key format has ',
    'been changed since the last successful build.'
  ].join('\n'));
}

// Add new results and limit the record to the specified number for the running
// average
const allBuildResults =
  [currentBuildResults, ...previousBuildResults].slice(0, runningAvgLength);

let averageResults = [];

// We assume that all the tests that were run this time will be the ones run 
// next time, so we only calculate the averages for those. This is will ignore
// any tests that were not run most recently but which were run in previous
// builds
currentBuildResults.forEach(({ name }) => {
  const times = [];

  // Check each build result to see if the test was run
  allBuildResults.forEach(buildResults => {
    const { time } = buildResults.find(test => test.name === name) || {};

    // It's possible this particular test wasn't run in this build
    if (time !== undefined) {
      times.push(!isNaN(time) ? time : 0);
    }
  })

  const averageTime =
    Math.floor(times.reduce((p, x) => p + x, 0) / times.length * 1000) / 1000;

  averageResults.push({ name, time: averageTime });
});

// This is a naïve but simple allocation which just take the largest remaining
// test and puts it in the group with the lowest total
const groupTestNames = Array(numGroups);
const totals = Array(numGroups).fill(0);
const getMin = () =>
  totals.reduce((min, total, i) => total < totals[min] ? i : min, 0);

averageResults.sort((a, b) => b.time - a.time);

averageResults.forEach(({ name, time }) => {
  const min = getMin();

  groupTestNames[min]
    ? groupTestNames[min].push(name)
    : groupTestNames[min] = [name];

  totals[min] += time;
});

// Create the (long) regular expressions for each group
groupTestNames.forEach((names, i) => {
  const escapedNames = names.map(
    name => name.replace(/['"-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  );
  
  let testMatcher = `^${escapedNames.join('$|^')}$`;

  // Put any new tests on the first group - in case the number of groups happens
  // to reduce we can still catch these tests
  if (i === 0) {

    // Create the (even longer) regular expression to catch any other tests that
    // might get added to the suite or which may have been turned off for the 
    // most recent build
    const otherTestsMatcher = groupTestNames.map(names => {
      const escapedNames = names.map(
        name => name.replace(/['"-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      );
      
      return `^${escapedNames.join('$|^')}$`;
    }).join('|');
    

    testMatcher += `|^(?!.*(${otherTestsMatcher})).*$`;
  }
  
  fs.writeFileSync(`../../tmp/test-groups/${i}.txt`, testMatcher);
  console.log([
    `Group ${i} Tests (${names.length} tests, ~${Math.round(totals[i])}s):`, 
    ...names, 
    ' '
  ].join('\n'));
});

console.log(`Total Tests Balanced: ${averageResults.length}`)

// Write the results so we can use them for calculating averages in the next
// build
fs.writeFileSync(
  '../../tmp/test-groups/data.json', 
  JSON.stringify(allBuildResults)
); 
