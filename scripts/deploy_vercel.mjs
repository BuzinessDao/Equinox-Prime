import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_AUTH_TOKEN;
if (!VERCEL_TOKEN) {
  console.error("Error: VERCEL_TOKEN environment variable is required.");
  process.exit(1);
}
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_eEJJzs4pkBryDFJRHPqrUTMl";
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");

function getFiles(dir, base = "") {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === "node_modules" || file === ".next" || file === ".git" || file.endsWith(".log")) {
      continue;
    }
    const fullPath = path.join(dir, file);
    const relPath = base ? `${base}/${file}` : file;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

async function uploadFile(content, sha) {
  const res = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM_ID}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Length": content.length.toString(),
      "x-vercel-digest": sha,
    },
    body: content,
  });

  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`File upload failed (${res.status}): ${text}`);
  }
}

async function main() {
  console.log("==> Scanning frontend directory:", FRONTEND_DIR);
  const files = getFiles(FRONTEND_DIR);
  console.log(`==> Found ${files.length} files to upload.`);

  const deploymentFiles = [];

  for (const item of files) {
    const content = fs.readFileSync(item.fullPath);
    const sha = crypto.createHash("sha1").update(content).digest("hex");
    console.log(`Uploading [${sha.slice(0, 8)}] ${item.relPath} (${content.length} bytes)...`);
    await uploadFile(content, sha);
    deploymentFiles.push({
      file: item.relPath,
      sha: sha,
      size: content.length,
    });
  }

  console.log("==> Creating Vercel deployment for Equinox Prime...");
  const deployPayload = {
    name: "equinox-prime",
    project: "equinox-prime",
    target: "production",
    files: deploymentFiles,
    projectSettings: {
      framework: "nextjs",
      buildCommand: "next build",
      outputDirectory: ".next",
    },
  };

  const deployRes = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(deployPayload),
  });

  const deployData = await deployRes.json();
  if (!deployRes.ok) {
    console.error("Deployment failed:", deployData);
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log("✓ DEPLOYMENT CREATED SUCCESSFULLY!");
  console.log(`Deployment ID:  ${deployData.id}`);
  console.log(`Deployment URL: https://${deployData.url}`);
  if (deployData.alias && deployData.alias.length > 0) {
    console.log(`Production URL: https://${deployData.alias[0]}`);
  }
  console.log("=======================================================\n");

  // Output JSON for programmatic consumption
  fs.writeFileSync(
    path.join(__dirname, "../vercel-deployment.json"),
    JSON.stringify(deployData, null, 2),
    "utf-8"
  );
}

main().catch((err) => {
  console.error("Fatal deployment error:", err);
  process.exit(1);
});
