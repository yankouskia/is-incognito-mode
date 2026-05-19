// Demonstrates that importing in Node is fine, but invoking the detector
// without a browser-like global throws the typed NOT_A_BROWSER error.
import { detectIncognito, IncognitoDetectionError } from 'is-incognito-mode';

try {
  const result = await detectIncognito();
  console.log('Unexpected result:', result);
} catch (error) {
  if (error instanceof IncognitoDetectionError) {
    console.log('Got the expected typed error:');
    console.log('  name :', error.name);
    console.log('  code :', error.code);
    console.log('  msg  :', error.message);
  } else {
    throw error;
  }
}
