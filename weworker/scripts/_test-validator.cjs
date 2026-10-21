const { validateBuildProfile } = require('./build-profile-validator.cjs');
const { loadBuildProfile } = require('./model-provider-config.cjs');
const profile = loadBuildProfile();

// Test 1: valid profile
try { validateBuildProfile(profile); console.log('PASS: valid profile accepted'); } catch(e) { console.log('FAIL:', e.message); }

// Test 2: missing adapters
try { validateBuildProfile({ providers: [], defaultProvider: 'x' }); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: missing adapters'); }

// Test 3: defaultProvider not in providers
try { validateBuildProfile({ adapters: [], providers: [{ id: 'a', name: 'A', baseUrl: '' }], defaultProvider: 'nope' }); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: bad defaultProvider'); }

// Test 4: non-object
try { validateBuildProfile('string'); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: non-object'); }

// Test 5: provider missing required fields
try { validateBuildProfile({ adapters: [], providers: [{ id: 'a' }], defaultProvider: 'a' }); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: bad provider fields'); }

// Test 6: null input
try { validateBuildProfile(null); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: null input'); }

// Test 7: array input
try { validateBuildProfile([]); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: array input'); }

console.log('All smoke tests done.');
