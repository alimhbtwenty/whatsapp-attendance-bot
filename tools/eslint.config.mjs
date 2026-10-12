export default [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: {
  window:'readonly', document:'readonly', localStorage:'readonly', navigator:'readonly', location:'readonly', console:'readonly', setTimeout:'readonly', clearTimeout:'readonly', setInterval:'readonly', clearInterval:'readonly',
  crypto:'readonly', TextEncoder:'readonly', TextDecoder:'readonly', btoa:'readonly', atob:'readonly', Intl:'readonly', FileReader:'readonly', Blob:'readonly', URL:'readonly', Event:'readonly', CSS:'readonly',
  getComputedStyle:'readonly', Notification:'readonly', AudioContext:'readonly', PublicKeyCredential:'readonly', Storage:'readonly', alert:'readonly', confirm:'readonly', requestAnimationFrame:'readonly', fetch:'readonly' } },
  rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' } }];
