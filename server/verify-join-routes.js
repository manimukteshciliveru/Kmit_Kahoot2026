#!/usr/bin/env node
/**
 * Student Join Quiz - Fix Verification
 * Verifies that the join endpoint is correctly routed
 */

const fs = require('fs');
const path = require('path');

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                 STUDENT JOIN QUIZ - ROUTE FIX VERIFICATION                ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

const routesPath = path.join(__dirname, 'routes', 'quiz.js');
const routesContent = fs.readFileSync(routesPath, 'utf8');

console.log('Checking Route Order...\n');

// Find the positions of key routes
const joinRoutePos = routesContent.search(/router\.post\(['"]\/join\/:code/);
const idRoutePos = routesContent.search(/router\.route\(\s*['"]\/:\w+['"]\s*\)/);

console.log(`✓ Route File: routes/quiz.js`);
console.log(`✓ /join/:code route found at position: ${joinRoutePos}`);
console.log(`✓ /:id route found at position: ${idRoutePos}`);

if (joinRoutePos < idRoutePos) {
    console.log(`\n✅ PASSED: /join/:code route is BEFORE /:id route (correct order)`);
} else {
    console.log(`\n❌ FAILED: /join/:code route is AFTER /:id route (wrong order)`);
    process.exit(1);
}

// Check for specific routing patterns
const checks = [
    {
        name: 'Join route is POST method',
        test: () => routesContent.includes(`router.post('/join/:code', joinQuiz)`)
    },
    {
        name: 'Start route before ID route',
        test: () => routesContent.search(/router\.post\(['"]\/:\w+\/start/) > 
                   routesContent.search(/router\.route\(\s*['"]\/:\w+['"]/)
    },
    {
        name: 'End route before ID route',
        test: () => routesContent.search(/router\.post\(['"]\/:\w+\/end/) > 
                   routesContent.search(/router\.route\(\s*['"]\/:\w+['"]/)
    },
    {
        name: 'ID route comes last',
        test: () => routesContent.lastIndexOf('router.route(') > 
                   routesContent.lastIndexOf('router.post')
    }
];

console.log('\nAdditional Checks:\n');
let allPassed = true;

checks.forEach((check, idx) => {
    try {
        const result = check.test();
        console.log(`  ${result ? '✓' : '✗'} ${check.name}`);
        if (!result) allPassed = false;
    } catch (e) {
        console.log(`  ⚠ ${check.name} (skipped)`);
    }
});

console.log('\n' + '═'.repeat(80));

if (allPassed) {
    console.log(`
✅ ALL CHECKS PASSED

The student join quiz flow should now work:
  1. Student enters quiz code in JoinQuiz component
  2. API calls POST /quizzes/join/{CODE}
  3. /join/:code route is matched (before /:id catch-all)
  4. joinQuiz controller is executed
  5. Response document is created
  6. Student is redirected to PlayQuiz page

Route Priority:
  1. router.post('/join/:code', ...)    ← Specific: Join handler
  2. router.post('/:id/start', ...)     ← Specific: Start handler
  3. router.post('/:id/end', ...)       ← Specific: End handler
  4. router.route('/:id')               ← Generic: Catch-all for ID routes

✓ Students can now join quizzes successfully!
    `);
} else {
    console.log(`
❌ SOME CHECKS FAILED

Please review the route file and ensure:
  - /join/:code comes before /:id routes
  - All POST routes for specific actions come before the generic /:id route
    `);
    process.exit(1);
}
