// Usage: node scripts/set-password.js "new-family-password"   (then restart the server)
// Changing the password also signs out every device (new session secret).
const c = require('crypto'), fs = require('fs'), path = require('path');
const pw = process.argv[2];
if (!pw || pw.length < 8) { console.error('Give a password of at least 8 characters'); process.exit(1); }
const salt = c.randomBytes(16).toString('hex');
const file = path.join(__dirname, '..', 'config', 'auth.json');
fs.writeFileSync(file, JSON.stringify({ _comment: 'Family password (scrypt hash only). Change it with: node scripts/set-password.js "new-password"', salt, hash: c.scryptSync(pw, salt, 64).toString('hex'), sessionSecret: c.randomBytes(32).toString('hex'), sessionDays: 365 }, null, 2));
fs.chmodSync(file, 0o600);
console.log('Password updated. Restart the server.');
