import express from "express";

const app = express();

app.get("/.well-known/openid-configuration", (req, res) => {
  res.json({
    issuer: "http://localhost:3000",
    authorization_endpoint: "http://localhost:3000/oauth/authorize",
    userinfo_endpoint: "http://localhost:3000/oauth/userinfo",
    jwks_uri: "http://localhost:3000/.well-known/jwks.json",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
