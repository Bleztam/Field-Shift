// Test entrypoint — run with: npx tsx tests/run-all.ts
import { installFetchMock, runAll } from "./helpers";
import "./addis-tts.test";
import "./crop-intent.test";
import "./api-routes.test";
import "./static-checks.test";

installFetchMock();
void runAll();
