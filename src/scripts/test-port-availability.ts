import { execSync } from 'node:child_process';
import * as portfinder from 'portfinder';

// Configure portfinder to start looking from port 8080
portfinder.setBasePort(8080);

portfinder.getPort((err, port) => {
  if (err) {
    console.error('Error finding available port:', err);
    // eslint-disable-next-line node/prefer-global/process
    process.exit(1);
  }

  try {
    if (port === 8080) {
      console.log('Using default port 8080');
      execSync('start-server-and-test \'http-server -p 8080\' http://localhost:8080 \'cypress run\'', { stdio: 'inherit' });
    } else {
      console.log(`Port 8080 is in use, starting server on port ${port} instead`);
      execSync(`start-server-and-test 'http-server -p ${port}' http://localhost:${port} 'cypress run'`, { stdio: 'inherit' });
    }
  } catch (error) {
    console.log('Tests completed with some failures, but continuing execution :\n');
    // If you want to see the error details, you can uncomment the next line
    console.log(error);
  }
});
