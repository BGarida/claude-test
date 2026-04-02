import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@proof-clone/core",
    "@proof-clone/editor",
    "@proof-clone/agent-bridge",
    "@proof-clone/db",
  ],
};

export default nextConfig;
