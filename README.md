# LandLedger

**Blockchain-Based Land Registration System** · Blockchain Technology academic project

LandLedger registers a private PDF deed in MySQL and commits its SHA-256 digest and owner wallet to Ethereum. An owner signs each transfer proposal. A designated administrator signs its approval or rejection. A public lookup recomputes the commitment and checks the title against the deployed contract.

## Open the prepared Windows demo

To start or reopen the local stack from this project folder, run this command in PowerShell.

```powershell
.\scripts\Start-LocalDemo.ps1
```

The launcher reuses running services. After a local chain restart it provisions a separate MySQL database for the new deployment and preserves previous databases. It writes service logs in `.local`. For a new Windows checkout with MySQL installed, complete the install-and-build step below before running the launcher. Use `-MySqlHome` if MySQL Server is installed in a different directory.

Open [the local portal](http://127.0.0.1:5173/) in a browser with MetaMask. Select **Sign in → Create an account** to register as a landowner or buyer. The local administrator email and generated password are in `.local/preview-secrets.json` on this machine. The application creates the admin account on first startup. Keep the entire `.local` folder private.

The prepared instance uses its own MySQL data directory on port 33307. The automated demonstration uses a separate database and contract. The registry overview starts empty until you register land. For a classroom run, use the [walkthrough](docs/demonstration.md) and [fictional deed](docs/demo-deed.pdf).

## Install on another machine

You need Node.js 22 or 24, npm, JDK 17 or later, Maven 3.9, MySQL 8 (or Docker Compose), and a browser with MetaMask. Commands below run from the project root in PowerShell. On Windows, `npm.cmd` works when PowerShell blocks the npm script shim.

The project ZIP includes the built Java JAR and frontend bundle. For a local Windows demo using the included build and a native MySQL installation, extract the archive, run `npm.cmd ci`, then run `.\scripts\Start-LocalDemo.ps1`. The steps below also cover rebuilding the source, using Docker for MySQL, and connecting to Sepolia.

### 1. Install and build

```powershell
npm.cmd ci
npm.cmd run chain:test
mvn -f backend/pom.xml package
npm.cmd run build
```

The Solidity compiler is installed with npm. Hardhat uses that pinned compiler during builds. Maven creates `backend/target/registry-1.0.0.jar`. The React production build goes into `frontend/dist`. If Maven is bundled with IntelliJ IDEA, you can run its `plugins/maven/lib/maven3/bin/mvn.cmd` by absolute path.

### 2. Configure the database and administrator

```powershell
.\scripts\registry.ps1 Configure
.\scripts\registry.ps1 Database
```

The first command asks for the administrator email and generates passwords and a JWT signing secret in `.local/settings.json`. The second starts MySQL in Docker with a persistent volume. Wait for MySQL to finish initial setup.

**Existing MySQL installation.** Skip the Database command. Create a dedicated database and user with permission to create tables and read/write rows in that database. Set `DB_URL`, `DB_USER`, and `DB_PASSWORD` in the settings file to match. The backend applies the [schema](backend/src/main/resources/schema.sql) on startup. MySQL must accept PDFs up to 5 MB, so allow at least 8 MB for `max_allowed_packet`.

### 3. Start a local blockchain

```powershell
Copy-Item blockchain/.env.example blockchain/.env
npm.cmd run chain:node
```

Leave the node running. In `blockchain/.env`, set `ADMIN_WALLET` to the address of a dedicated test account you control in MetaMask. Open a second terminal and run the following.

```powershell
npm.cmd run chain:local
npm.cmd run bridge
```

Deployment writes the chain ID, contract address, creation block and creation-block hash to `blockchain/deployments/localhost.json`. Keep the bridge running. Add a custom network in MetaMask with URL `http://127.0.0.1:8545`, chain ID `31337`, and currency symbol `ETH`. Select it before signing. To fund each signing wallet, run the command below with its public address. It sends one unit of local test ETH from the development node. [MetaMask network setup](https://support.metamask.com/configure/networks/how-to-add-a-custom-network-rpc/)

```powershell
node blockchain/scripts/fund-local.cjs YOUR_PUBLIC_TEST_WALLET_ADDRESS
```

The prepared Windows demo uses the node’s first development account as administrator. Its public address is in `blockchain/deployments/localhost.json`. For this disposable chain, you can import the corresponding development account from the Hardhat node output into a dedicated test wallet profile. For a fresh deployment, setting your own `ADMIN_WALLET` before deploying avoids importing a development key.

### 4. Start the API and website

Run each command in a separate terminal and keep it open.

```powershell
.\scripts\registry.ps1 Api
```

```powershell
npm.cmd run dev
```

Open [LandLedger](http://127.0.0.1:5173/). The frontend proxies `/api` to Spring Boot on port 8080. The read-only bridge listens on 8546. On this prepared machine, use `.\scripts\registry.ps1 Api -SettingsFile .local/preview-secrets.json` when restarting only the API. If PowerShell script execution is restricted, you can set the environment variables below yourself and run `java -jar backend/target/registry-1.0.0.jar`.

### 5. Use Sepolia

1. Obtain an HTTPS Ethereum Sepolia RPC endpoint supporting `eth_getLogs`, finalized blocks, and recent historical contract calls. Fund dedicated deployer, administrator, and landowner test accounts with Sepolia ETH. Ethereum maintains a list of testnet faucets. [Ethereum test networks](https://ethereum.org/developers/docs/networks/)
2. In the ignored `blockchain/.env`, set `REGISTRY_NETWORK=sepolia`, `SEPOLIA_RPC_URL`, and `ADMIN_WALLET`. Supply `DEPLOYER_KEY` **only to the deployment command**, preferably through the terminal environment. It accepts a disposable test account’s 0x-prefixed private key. Keep keys out of frontend variables, source, logs, and project submissions.
3. Run `npm.cmd run chain:sepolia` once. Retain `blockchain/deployments/sepolia.json`. Clear the deployment secret from the environment and remove it from the configuration if you put it there.
4. Point the backend at a fresh, separately provisioned MySQL database for this deployment. Restart the bridge and API. Select Sepolia (chain ID 11155111) in MetaMask. Sign in as the configured administrator and link the exact `ADMIN_WALLET`.
5. Register and transfer using the walkthrough. The application displays the real transaction hash after submission. The indexer publishes Sepolia events after finality, which can take several minutes. Confirmed Sepolia hashes link to Etherscan.

A local Hardhat node loses its chain when its process stops. Use a fresh database for each newly created local chain, or reconnect the database to its original persistent chain. The API binds a database to the chain ID, contract address, and creation-block hash. A mismatch stops indexing. For an ongoing project demonstration across restarts, keep the Sepolia deployment and its database together.

## Configuration reference

| Setting | Used by | Purpose |
| --- | --- | --- |
| DB_URL, DB_USER, DB_PASSWORD | Spring Boot | MySQL JDBC URL and registry account |
| JWT_SECRET | Spring Boot | Random secret of at least 32 bytes for eight-hour sessions |
| ADMIN_EMAIL, ADMIN_PASSWORD | Spring Boot | Initial administrator, created only if the email is unused |
| PORT, BIND_ADDRESS | Spring Boot | Defaults to 8080 on loopback |
| BRIDGE_URL | Spring Boot | Defaults to http://127.0.0.1:8546 |
| API_TARGET | Vite | Alternate Spring Boot proxy target |
| REGISTRY_NETWORK | Bridge | localhost or sepolia |
| ADMIN_WALLET, DEPLOYER_KEY | Deployment | Administrator public address and Sepolia deployment signer |
| LOCAL_RPC_URL, SEPOLIA_RPC_URL | Bridge | RPC for the selected chain |

## Project guide

| Directory | Contents |
| --- | --- |
| frontend | React routes, Tailwind styles, Lucide icons, API client, MetaMask transaction signing |
| backend | Spring Boot REST API, authentication, validation, JDBC repository, digest service and event indexer |
| database | MySQL Compose configuration |
| blockchain | Solidity contract, Hardhat tests, deployment scripts, ethers read-only bridge and local workflow test |
| docs | Architecture diagram, contract and schema explanation, walkthrough and fictional PDF fixture |

Read the [architecture and API guide](docs/architecture.md) for the trust model, data layout and endpoints. The [demonstration guide](docs/demonstration.md) includes the automated end-to-end test instructions.

## Troubleshooting

- **Blockchain offline.** Check `/api/public/config` through the portal. Confirm the node, deployment file and bridge use the same network, and review the bridge terminal. A changed deployment requires its own database.
- **Wallet mismatch.** Select the account linked to this login and the correct network in MetaMask. Each wallet belongs to one registry account. Use separate accounts for the administrator, owner and buyer.
- **Awaiting blockchain.** Reopen the application as administrator and sign the prepared registration if the earlier wallet prompt was cancelled. A mined transaction can still be awaiting finality. Refresh the dashboard after confirmation.
- **Database unavailable.** Verify the JDBC port, credentials and MySQL readiness. A dash on the homepage indicates unavailable statistics. Registered counts come directly from the database.
- **Running the compiled frontend.** Serve `frontend/dist` with SPA fallback to `index.html` and proxy `/api/` to the Java service. During development Vite provides both.
- **Sharing your submission.** Share source, the lockfile, and documentation. Exclude `.local`, every `.env`, node output, wallet material, database files, and real deeds.
