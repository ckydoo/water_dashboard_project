const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repositoryName = process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split("/")[1]
  : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  ...(isGithubActions && repositoryName
    ? {
        basePath: `/${repositoryName}`,
        assetPrefix: `/${repositoryName}/`,
      }
    : {}),
};

module.exports = nextConfig;
