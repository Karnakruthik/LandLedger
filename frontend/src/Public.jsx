import React, { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Fingerprint,
  ShieldCheck,
  ScanLine,
  FileSearch,
  ShieldAlert,
  Layers3,
  ExternalLink,
  Search,
  Wallet,
  Landmark,
} from "lucide-react";
import {
  Page,
  Field,
  Lookup,
  Status,
  Notice,
  Feedback,
  Empty,
  Explorer,
  useAction,
  useLoad,
  useSession,
} from "./common";
import { api, compact, date, tokenKey } from "./api";

export function Auth({ signup = false }) {
  const { setUser } = useSession(),
    navigate = useNavigate(),
    location = useLocation(),
    action = useAction();
  const from = location.state?.from || "/dashboard";
  function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    action.act(async () => {
      const data = await api("/auth/" + (signup ? "signup" : "login"), {
        method: "POST",
        body,
      });
      sessionStorage.setItem(tokenKey, data.token);
      setUser(data.account);
      navigate(from, { replace: true });
    });
  }
  return (
    <section className="container inner authwrap">
      <aside className="authart">
        <Layers3 size={35} />
        <div className="eyebrow gold">CITIZEN SERVICES</div>
        <h2>Your land registry workspace</h2>
        <p>
          Manage applications, connect your wallet and follow changes to your
          property records.
        </p>
      </aside>
      <div className="paper authform">
        <h1>{signup ? "Create an account" : "Sign in"}</h1>
        <p>
          {signup
            ? "Choose how you’ll use the registry."
            : "Access your LandLedger account."}
        </p>
        <form onSubmit={submit} key={signup}>
          {signup && (
            <>
              <Field
                label="Full name"
                name="name"
                maxLength="100"
                autoComplete="name"
              />
              <Field label="Account type">
                <select name="role">
                  <option value="LANDOWNER">Landowner</option>
                  <option value="BUYER">Buyer</option>
                </select>
              </Field>
            </>
          )}
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
          />
          <Field
            label={signup ? "Password (at least 10 characters)" : "Password"}
            type="password"
            name="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 10 : 1}
            maxLength={72}
          />
          <Feedback action={action} />
          <button className="btn navy" disabled={action.busy}>
            {action.busy
              ? "Please wait…"
              : signup
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p>
          {signup ? "Already registered?" : "New to LandLedger?"}{" "}
          <Link
            className="textlink"
            to={signup ? "/login" : "/signup"}
            state={{ from }}
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </section>
  );
}
const outcome = {
  SYNCHRONIZING: [
    "Synchronizing registry",
    "More confirmed event batches are being indexed. Check this record again in a moment.",
    Fingerprint,
  ],
  VERIFIED: [
    "Verified",
    "The stored registration and current owner match the Ethereum record.",
    ShieldCheck,
  ],
  MISMATCH: [
    "Verification failed",
    "The registry and blockchain records differ. Check the details with the registry administrator.",
    ShieldAlert,
  ],
  NOT_FOUND: [
    "Record not found",
    "No public registration was found for this property ID.",
    FileSearch,
  ],
  CONFIRMING: [
    "Awaiting finality",
    "The contract contains this registration. Its event is awaiting registry synchronization.",
    Fingerprint,
  ],
};
export function Verify() {
  const [params, setParams] = useSearchParams(),
    id = params.get("id") || "",
    [rev, setRev] = useState(0);
  const { busy, data, error } = useLoad(
    id ? "/public/verify/" + encodeURIComponent(id) : null,
    rev,
  );
  const { user, config } = useSession(),
    action = useAction();
  const result = outcome[data?.result],
    Icon = result?.[2] || ShieldCheck,
    p = data?.property;
  return (
    <Page
      title="Blockchain verification"
      desc="Compare a land registration with its Ethereum record using the unique property ID."
    >
      <div className="paper">
        <h3>Verify land ownership</h3>
        <Lookup
          key={id}
          initial={id}
          busy={busy && !!id}
          onSearch={(value) => {
            setParams({ id: value });
            setRev((x) => x + 1);
          }}
        />
      </div>
      <Notice error>{error}</Notice>
      {result && (
        <div className={"paper proof " + data.result.toLowerCase()}>
          <Icon size={30} />
          <h2>{result[0]}</h2>
          <p>{result[1]}</p>
          <strong>{id}</strong>
          {p && (
            <>
              <dl className="details">
                <dt>Location</dt>
                <dd>
                  {p.location}, {p.district}, {p.state}
                </dd>
                <dt>Survey number</dt>
                <dd>{p.survey}</dd>
                <dt>Property type / area</dt>
                <dd>
                  {p.property_type} · {p.area} m²
                </dd>
                <dt>Owner wallet on-chain</dt>
                <dd>{data.wallet}</dd>
                <dt>Computed SHA-256</dt>
                <dd>{data.digest}</dd>
                <dt>On-chain SHA-256</dt>
                <dd>{data.chainDigest}</dd>
                <dt>Title transaction</dt>
                <dd>
                  <Explorer config={config} hash={p.tx_hash} />
                </dd>
                <dt>Block number</dt>
                <dd>{p.block_number || "Awaiting finality"}</dd>
              </dl>
              <div className="actions">
                <Link className="btn secondary" to={"/transactions?id=" + id}>
                  View title history
                </Link>
                {config?.chainId === 11155111 && p.tx_hash && (
                  <Explorer config={config} hash={p.tx_hash}>
                    Open on Sepolia Etherscan
                  </Explorer>
                )}
                {user?.role === "BUYER" &&
                  data.result === "VERIFIED" &&
                  user.wallet !== p.owner_wallet && (
                    <button
                      className="btn navy"
                      disabled={action.busy}
                      onClick={() =>
                        action.act(async (report) => {
                          await api("/properties/" + id + "/request", {
                            method: "POST",
                          });
                          report("Transfer request sent to the current owner.");
                        })
                      }
                    >
                      Request transfer
                    </button>
                  )}
              </div>
              <Feedback action={action} />
            </>
          )}
        </div>
      )}
    </Page>
  );
}
export function EventTable({ rows, config }) {
  if (!rows?.length)
    return <Empty>No blockchain transactions to display.</Empty>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {[
              "Property / transaction",
              "Operation",
              "Previous owner",
              "New / proposed owner",
              "Block",
              "Date",
              "Status",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tx_hash + r.log_index}>
              <td>
                <Link className="textlink" to={"/verify?id=" + r.property_id}>
                  {r.property_id}
                </Link>
                <small className="block mono">
                  <Explorer hash={r.tx_hash} config={config}>
                    {compact(r.tx_hash)}
                  </Explorer>
                </small>
              </td>
              <td>{r.kind.replace(/([a-z])([A-Z])/g, "$1 $2")}</td>
              <td title={r.previous_wallet}>
                {/^0x0+$/.test(r.previous_wallet)
                  ? "—"
                  : compact(r.previous_wallet)}
              </td>
              <td title={r.new_wallet}>{compact(r.new_wallet)}</td>
              <td>{r.block_number}</td>
              <td>{new Date(Number(r.recorded_at)).toLocaleString("en-IN")}</td>
              <td>
                <Status value="CONFIRMED" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Transactions() {
  const [params, set] = useSearchParams(),
    id = params.get("id") || "",
    page = Math.max(0, Number(params.get("page")) || 0),
    { config } = useSession();
  const { data, error, busy } = useLoad(
    "/public/history?page=" +
      page +
      (id ? "&id=" + encodeURIComponent(id) : ""),
  );
  return (
    <Page
      title="Blockchain transactions"
      desc="Browse confirmed registration and transfer events recorded by the registry contract."
    >
      <div className="paper">
        <form
          className="lookup"
          onSubmit={(e) => {
            e.preventDefault();
            set({
              id: new FormData(e.currentTarget).get("id").trim().toUpperCase(),
            });
          }}
        >
          <Search size={18} />
          <input
            name="id"
            aria-label="Filter by property ID"
            placeholder="Filter by property ID"
            defaultValue={id}
          />
          <button className="btn navy">Search</button>
        </form>
        <Notice error>{error}</Notice>
        {busy ? (
          <p>Loading transactions…</p>
        ) : (
          !error && <EventTable rows={data} config={config} />
        )}
        <div className="pagination">
          <button
            className="btn secondary"
            disabled={!page}
            onClick={() => set({ id, page: page - 1 })}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            className="btn secondary"
            disabled={data?.length !== 50}
            onClick={() => set({ id, page: page + 1 })}
          >
            Next
          </button>
        </div>
      </div>
    </Page>
  );
}
export function Information({ help = false }) {
  return (
    <Page
      title={help ? "Help centre" : "About LandLedger"}
      desc={
        help
          ? "Find answers about accounts, wallets and registry records."
          : "A blockchain-based land registration system for the Blockchain Technology academic project."
      }
    >
      <div className="paper prose">
        {help ? (
          <>
            {[
              [
                "How do I register my land?",
                "Create a landowner account and link your MetaMask wallet from the dashboard. Choose Register land, complete the parcel details, and attach a PDF deed up to 5 MB. Your application ID appears after submission.",
              ],
              [
                "Where do I find my property ID?",
                "Open My properties in your dashboard and select the application. Use the complete LAND- identifier to verify a registered title.",
              ],
              [
                "Why is my registration awaiting blockchain?",
                "The administrator has accepted the application. The designated wallet must sign the registration and the indexer must see its confirmed event. Sepolia finality can take several minutes.",
              ],
              [
                "How does a buyer request a transfer?",
                "Link your buyer wallet and verify a property ID. Select Request transfer. Its current owner must sign a proposal in MetaMask before an administrator can finalize it.",
              ],
              [
                "What if my wallet or network is unavailable?",
                "Enable MetaMask and select the network shown in the portal header. For a local chain, use the RPC and chain ID in the project README. Ask the project operator to check the bridge, RPC endpoint and contract if the portal shows offline.",
              ],
              [
                "How do I contact the registry?",
                "For an academic demonstration, contact the instructor or project operator who created your registry instance. Include the property ID and transaction hash when available.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </>
        ) : (
          <>
            <h2>One verifiable chain of ownership</h2>
            <p>
              LandLedger connects the review of land documents with an Ethereum
              record of title. Citizens submit their details to the registry. An
              administrator reviews each application before recording a property
              identifier, a wallet address and a document commitment on-chain.
            </p>
            <h3>What a verification checks</h3>
            <p>
              The registry hashes the original registration fields and the
              stored deed again, then compares the result and the current
              owner’s wallet with the deployed contract. A change to the deed or
              committed details produces a different digest.
            </p>
            <h3>How ownership changes</h3>
            <p>
              The current owner signs a proposal naming the next wallet. The
              administrator reviews that proposal and signs the final decision.
              Each approved change remains traceable in the public transaction
              history.
            </p>
            <h3>Scope of the project</h3>
            <p>
              The application demonstrates the integrity of records accepted by
              this academic registry. Documentary and physical title checks
              remain part of the administrator’s review.
            </p>
            <Link className="btn navy" to="/verify">
              <ScanLine size={17} />
              Verify a record
            </Link>
          </>
        )}
      </div>
    </Page>
  );
}
