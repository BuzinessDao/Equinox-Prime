/** @type {import('next').NextConfig} */
const nextConfig = {
  // Noir WASM packages need to be transpiled
  transpilePackages: ["@noir-lang/noir_js", "@noir-lang/backend_barretenberg"],

  webpack(config, { isServer }) {
    // Enable async WASM for Noir prover
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    // Treat .wasm files as assets
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    // Prevent server-side bundling of WASM/Noir modules
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "@noir-lang/noir_js",
        "@noir-lang/backend_barretenberg",
      ];
    }

    return config;
  },
};

export default nextConfig;
