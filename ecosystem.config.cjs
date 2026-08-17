module.exports = {
  apps: [
    {
      name: "touch-grass-3000",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "dev -p 3000",
      env: { NODE_ENV: "development" },
    },
  ],
};
