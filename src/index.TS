import express from "express";
import path from "node:path";
import jose from "node-jose";
import crypto from "node:crypto";
import { PUBLIC_KEY, PRIVATE_KEY } from "./utils/cert.js";
import { db } from "./db/index.js";
import { eq } from "drizzle-orm";
import {
  userTable,
  applicationTable,
  authorizationCodeTable,
} from "./db/schema.js";
import type { JWTClaims } from "./utils/user-token.js";
import JWT from "jsonwebtoken";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve("public")));

app.get("/", (req, res) => {
  res.json({ message: "Hello from Auth Server" });
});

app.get("/health", (req, res) => {
  res.json({ message: "Server is Healthy", healthy: true });
});

// OIDC Implementation
app.get("/.well-known/openid-configuration", (req, res) => {
  const ISSUER = `http://localhost:3000`;
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/o/authorize`,
    userinfo_endpoint: `${ISSUER}/o/userinfo`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    tokeninfo: `${ISSUER}/o/tokeninfo`,
  });
});

app.get("/.well-known/jwks.json", async (req, res) => {
  const key = await jose.JWK.asKey(PUBLIC_KEY, "pem");
  return res.json({ keys: [key.toJSON()] });
});

app.get("/o/authenticate", (req, res) => {
  return res.sendFile(path.resolve("public", "authenticate.html"));
});

app.post("/o/authenticate/sign-in", async (req, res) => {
  const { email, password, client_id, redirect_uri, state, nonce } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (!user || !user.password || !user.salt) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const hash = crypto
    .createHash("sha256")
    .update(password + user.salt)
    .digest("hex");

  if (hash !== user.password) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const [application] = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.client_id, client_id))
    .limit(1);

  if (!application) {
    return res.status(400).json({
      message: "Invalid client_id",
    });
  }

  if (application.redirectUri !== redirect_uri) {
    return res.status(400).json({
      message: "Invalid redirect_uri",
    });
  }
  const code = crypto.randomBytes(32).toString("hex");

  await db.insert(authorizationCodeTable).values({
    code,
    userId: user.id,
    client_id,
    redirect_uri,
    nonce,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
  });
  return res.json({
    redirect: `${redirect_uri}?code=${code}&state=${state}`,
  });
});

app.post("/o/authenticate/sign-up", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !password || !firstName) {
    res
      .status(400)
      .json({ message: "First Name, email and Password is required " });
    return;
  }

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (existing) {
    res
      .status(409)
      .json({ message: "An account already exist with this email id" });
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(password + salt)
    .digest("hex");

  await db.insert(userTable).values({
    firstName,
    lastName: lastName ?? null,
    email,
    password: hash,
    salt,
  });

  res.status(201).json({ ok: true });
});

app.get("/o/userinfo", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ message: "Missing or invalid Authorization header." });
    return;
  }

  const token = authHeader.slice(7);

  let claims: JWTClaims;
  try {
    claims = JWT.verify(token, PUBLIC_KEY, {
      algorithms: ["RS256"],
    }) as JWTClaims;
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
    return;
  }

  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, claims.sub))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  res.json({
    sub: user.id,
    email: user.email,
    email_verified: user.emailVerified,
    given_name: user.firstName,
    family_name: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    picture: user.profileImageURL,
  });
});

//OAuth Implementation
app.post("/admin/application", async (req, res) => {
  const { displayName, applicationUrl, redirectUri } = req.body;

  if (!displayName || !applicationUrl || !redirectUri) {
    return res.status(400).json({
      message: "Display Name, Application URL, Redirct URL is required",
    });
  }
  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomBytes(32).toString("hex");

  const [application] = await db
    .insert(applicationTable)
    .values({
      displayName,
      applicationUrl,
      redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    })
    .returning();

  return res.json({
    client_id: application?.client_id,
    client_secret: application?.client_secret,
  });
});

app.get("/o/authorize", async (req, res) => {
  try {
    const { client_id, redirect_uri, response_type, state, nonce } = req.query;

    // Required params
    if (!client_id || !redirect_uri) {
      return res.status(400).json({
        message: "client_id and redirect_uri are required",
      });
    }

    // OAuth Authorization Code Flow only
    if (response_type !== "code") {
      return res.status(400).json({
        message: "Only Authorization Code flow is supported",
      });
    }

    // Validate application
    const [application] = await db
      .select()
      .from(applicationTable)
      .where(eq(applicationTable.client_id, String(client_id)))
      .limit(1);

    if (!application) {
      return res.status(404).json({
        message: "Invalid client_id",
      });
    }
    // Validate redirect URI
    if (application.redirectUri !== String(redirect_uri)) {
      return res.status(400).json({
        message: "Invalid redirect_uri",
      });
    }
    // Show login page
    return res.sendFile(path.resolve("public", "authenticate.html"));
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

app.post("/o/tokeninfo", async (req, res) => {
  const { code, client_secret } = req.body;

  if (!client_secret || !code) {
    return res
      .status(400)
      .json({ message: "Code and Client Secret is required" });
  }

  const [application] = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.client_secret, client_secret))
    .limit(1);

  if (!application) {
    return res.status(401).json({ message: "Invalid client Secret" });
  }
  const [authCode] = await db
    .select()
    .from(authorizationCodeTable)
    .where(eq(authorizationCodeTable.code, code))
    .limit(1);

  if (!authCode) {
    return res.status(400).json({ message: "Invalid Code" });
  }

  if (authCode.client_id !== application.client_id) {
    return res.status(400).json({
      message: "Code does not belong to client",
    });
  }

  if (authCode.used) {
    return res.status(400).json({
      message: "Code already used",
    });
  }

  if (authCode.expires_at.getTime() < Date.now()) {
    return res.status(400).json({
      message: "Code expired",
    });
  }
  const [user] = await db
  .select()
  .from(userTable)
  .where(eq(userTable.id, authCode.userId))
  .limit(1)

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }
  return res.json({
    message: "User fetched successfully",
    user: {
      id: user.id,
      email: user.email,
    },
  });

});
app.listen(PORT, () => {
  console.log(`AuthServer is running on http://localhost:${PORT}`);
});
