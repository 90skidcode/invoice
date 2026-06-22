import { createDbClient } from '@counter/db';
import { authenticateLogin } from './src/services/auth.service.js';

const db = createDbClient(process.env.DATABASE_URL || 'postgresql://localhost:5432/counter_dev');

async function test() {
  try {
    await authenticateLogin(db, {
      identifier: "9677880063",
      credential: "4747",
      credential_type: "pin",
      org_code: "COCOGLO-01",
      device: {
        id: "019e7a54-52d1-7a89-8a23-58c2abee61fb",
        name: "Web Browser",
        platform: "web",
        app_version: "1.0.0",
        install_id: "019e7a54-52d1-7a89-8a23-58c2abee61fb"
      }
    });
    console.log("Success with Deepika's number!");
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
