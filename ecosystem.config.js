module.exports = {
  apps: [
    {
      name: "pkp-scrap",
      script: "./index.js",
      env: {
        NODE_ENV: "development",
        PORT: 3008
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3008
      }
    }
  ]
}