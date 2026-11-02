import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT) || 3000;
const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SRC_DIR, "..");
const DATA_FILE = resolve(SRC_DIR, "data.json");

const defaults = {
  contacts: [],
  campaigns: [],
  calls: [],
  settings: {
    agentName: "Endure AI",
    disclosure: "Hello, I am an AI assistant calling on behalf of the business.",
    voicemailScript: "",
    maxConcurrentCalls: 2
  }
};

async function loadData() {
  try {
    return { ...defaults, ...JSON.parse(await readFile(DATA_FILE, "utf8")) };
  } catch {
    return structuredClone(defaults);
  }
}

let data = await loadData();

async function saveData() {
  await mkdir(SRC_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1000000) throw new Error("Request too large");
  }
  return raw ? JSON.parse(raw) : {};
}

function eligible(c) {
  return c.consent === true && c.doNotCall !== true;
}

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;
  const method = req.method;

  try {
    if (path.startsWith("/api/")) {
      if (method === "GET" && path === "/api/health") {
        return json(res, 200, {
          status: "online",
          application: "Endure Dialer",
          version: "0.2.0",
          callingEnabled: false
        });
      }

      if (method === "GET" && path === "/api/dashboard") {
        return json(res, 200, {
          contacts: data.contacts.length,
          eligible: data.contacts.filter(eligible).length,
          campaigns: data.campaigns.length,
          calls: data.calls.length
        });
      }

      if (method === "GET" && path === "/api/contacts") {
        return json(res, 200, data.contacts);
      }

      if (method === "POST" && path === "/api/contacts/import") {
        const input = await body(req);
        const rows = Array.isArray(input.rows) ? input.rows : [];

        if (rows.length > 5000) {
          return json(res, 400, { error: "Maximum 5000 contacts per import." });
        }

        let imported = 0;
        let skipped = 0;

        for (const row of rows) {
          const phone = String(row.phone || row.phone_number || row.mobile || "").trim();
          const name = String(row.name || row.full_name || row.first_name || "").trim();

          if (!phone) {
            skipped++;
            continue;
          }

          data.contacts.push({
            id: randomUUID(),
            name: name || "Unnamed contact",
            phone,
            consent: ["true", "yes", "granted"].includes(
              String(row.consent || "").toLowerCase()
            ),
            doNotCall: ["true", "yes"].includes(
              String(row.do_not_call || row.donotcall || "").toLowerCase()
            ),
            status: "Imported",
            source: "CSV import",
            createdAt: new Date().toISOString()
          });

          imported++;
        }

        await saveData();
        return json(res, 200, { imported, skipped });
      }

      if (method === "PATCH" && path.startsWith("/api/contacts/")) {
        const id = decodeURIComponent(path.slice("/api/contacts/".length));
        const contact = data.contacts.find(c => c.id === id);

        if (!contact) {
          return json(res, 404, { error: "Contact not found." });
        }

        const input = await body(req);

        if (typeof input.consent === "boolean") {
          contact.consent = input.consent;
        }

        if (typeof input.doNotCall === "boolean") {
          contact.doNotCall = input.doNotCall;
        }

        contact.status = eligible(contact) ? "Eligible" : "Not eligible";

        await saveData();
        return json(res, 200, contact);
      }

      if (method === "GET" && path === "/api/campaigns") {
        return json(res, 200, data.campaigns);
      }

      if (method === "POST" && path === "/api/campaigns") {
        const input = await body(req);
        const name = String(input.name || "").trim();

        if (!name) {
          return json(res, 400, { error: "Campaign name is required." });
        }

        const ids = Array.isArray(input.contactIds) ? input.contactIds : [];
        const selected = data.contacts.filter(c => ids.includes(c.id));
        const allowed = selected.filter(eligible);

        const campaign = {
          id: randomUUID(),
          name,
          contactIds: allowed.map(c => c.id),
          eligible: allowed.length,
          blocked: selected.length - allowed.length,
          note: "Draft only. No calls placed.",
          status: "Draft",
          createdAt: new Date().toISOString()
        };

        data.campaigns.unshift(campaign);
        await saveData();

        return json(res, 201, campaign);
      }

      if (path === "/api/settings" && method === "GET") {
        return json(res, 200, data.settings);
      }

      if (path === "/api/settings" && method === "PUT") {
        const input = await body(req);

        if (typeof input.agentName === "string") {
          data.settings.agentName = input.agentName.slice(0, 100);
        }

        if (typeof input.disclosure === "string") {
          data.settings.disclosure = input.disclosure.slice(0, 2000);
        }

        if (typeof input.voicemailScript === "string") {
          data.settings.voicemailScript = input.voicemailScript.slice(0, 2000);
        }

        if (Number.isInteger(input.maxConcurrentCalls)) {
          data.settings.maxConcurrentCalls = Math.min(
            5, Math.max(1, input.maxConcurrentCalls)
          );
        }

        await saveData();
        return json(res, 200, data.settings);
      }

      if (method === "GET" && path === "/api/provider/status") {
        return json(res, 200, {
          configured: Boolean(
            process.env.SIP_PROVIDER_URL &&
            process.env.SIP_USERNAME &&
            process.env.SIP_PASSWORD &&
            process.env.SIP_CALLER_NUMBER
          ),
          callingEnabled: false
        });
      }

      return json(res, 404, { error: "API endpoint not found." });
    }

    if (method !== "GET" && method !== "HEAD") {
      return json(res, 405, { error: "Method not allowed." });
    }

    if (path !== "/" && path !== "/index.html") {
      return json(res, 404, { error: "Not found." });
    }

    const html = await readFile(resolve(ROOT, "index.html"));

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(method === "HEAD" ? undefined : html);

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      json(res, 500, { error: "Application could not complete the request." });
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Endure Dialer running on port ${PORT}`);
});
