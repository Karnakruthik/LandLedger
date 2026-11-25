import React, { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Wallet,
  FilePlus2,
  FolderOpen,
  History,
  Download,
  ShieldCheck,
  MapPinned,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import {
  Page,
  Field,
  Notice,
  Feedback,
  Empty,
  Status,
  Explorer,
  Lookup,
  useAction,
  useLoad,
  useSession,
} from "./common";
import { api, compact, date, download } from "./api";
import { EventTable } from "./Public";
function WalletCard() {
  const { user, setUser } = useSession(),
    action = useAction();
  return (
    <div className="paper wallet">
      <div className="row">
        <Wallet />
        <div>
          <strong>
            {user.wallet ? "Linked wallet" : "Connect your wallet"}
          </strong>
          <p className="mono">
            {user.wallet ||
              "Authorize your account using a MetaMask signature."}
          </p>
        </div>
      </div>
      {!user.wallet && (
        <button
          className="btn secondary"
          disabled={action.busy}
          onClick={() =>
            action.act(async () =>
              setUser(await (await import("./wallet")).linkWallet()),
            )
          }
        >
          Link MetaMask
        </button>
      )}
      <Feedback action={action} />
    </div>
  );
}
function ParcelTable({ rows }) {
  if (!rows.length) return <Empty>No properties to display.</Empty>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {["Property", "Survey number", "Area", "Submitted", "Status"].map(
              (v) => (
                <th key={v}>{v}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <Link className="textlink" to={"/properties/" + p.id}>
                  {p.id}
                </Link>
                <small className="block">
                  {p.location}, {p.district}
                </small>
              </td>
              <td>{p.survey}</td>
              <td>{p.area} m²</td>
              <td>{date(p.created_at)}</td>
              <td>
                <Status value={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RequestTable({ rows, user }) {
  if (!rows?.length) return <Empty>No buyer requests yet.</Empty>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Buyer wallet</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.property_id + r.buyer}>
              <td>{r.property_id}</td>
              <td title={r.buyer_wallet}>{compact(r.buyer_wallet)}</td>
              <td>
                <Status value={r.status} />
              </td>
              <td>
                {r.status === "REQUESTED" && user.wallet === r.seller_wallet ? (
                  <Link
                    className="textlink"
                    to={
                      "/transfer/" + r.property_id + "?wallet=" + r.buyer_wallet
                    }
                  >
                    Authorize transfer
                  </Link>
                ) : (
                  <Link to={"/verify?id=" + r.property_id}>
                    Verify property
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Trends({ rows }) {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    return {
      name: d.toLocaleDateString("en", { month: "short" }),
      count: rows.filter((p) => {
        const v = new Date(p.created_at);
        return (
          v.getFullYear() === d.getFullYear() && v.getMonth() === d.getMonth()
        );
      }).length,
    };
  });
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <div className="paper">
      <h3>Registration trends</h3>
      <div className="bars">
        {months.map((m) => (
          <div key={m.name}>
            <small>{m.count}</small>
            <i style={{ height: Math.max(2, (70 * m.count) / max) }} />
            <span>{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function Dashboard() {
  const { user, config } = useSession(),
    admin = user.role === "ADMIN",
    buyer = user.role === "BUYER",
    nav = useNavigate();
  const [rev, setRev] = useState(0),
    p = useLoad("/properties", rev),
    r = useLoad("/requests", rev),
    v = useLoad(buyer ? "/views" : null, rev),
    events = useLoad(admin ? "/public/history" : "/my-history", rev),
    stats = useLoad(admin ? "/public/stats" : null, rev);
  const rows = p.data || [],
    approved = rows.filter((i) => i.status === "APPROVED"),
    owned = approved.filter((i) => i.owner_wallet === user.wallet),
    pending = rows.filter((i) => ["PENDING", "READY"].includes(i.status)),
    transfers = rows.filter((i) => i.proposed_wallet),
    error = p.error || r.error || events.error || v.error || stats.error;
  const counters = admin
    ? [
        ["Total properties", rows.length],
        ["Pending applications", pending.length],
        ["Approved properties", approved.length],
        ["Pending transfers", transfers.length],
        ["Blockchain transactions", stats.data?.transactions],
      ]
    : [
        ["Properties owned", owned.length],
        ["Pending registrations", pending.length],
        [
          "Approved registrations",
          approved.filter(
            (i) => i.applicant === user.id || i.initial_wallet === user.wallet,
          ).length,
        ],
        [
          "Transfer requests",
          (r.data || []).filter((i) => i.status === "REQUESTED").length,
        ],
      ];
  return (
    <Page
      title={
        (admin ? "Administrator" : buyer ? "Buyer" : "Landowner") + " dashboard"
      }
      desc={"Welcome, " + user.name + "."}
      actions={
        <button className="btn secondary" onClick={() => setRev((x) => x + 1)}>
          <RefreshCw size={15} />
          Refresh
        </button>
      }
    >
      <div className="actions tabs">
        <Link className="btn secondary" to="/properties">
          <FolderOpen size={16} />
          {admin ? "All properties" : "My properties"}
        </Link>
        {user.role === "LANDOWNER" && (
          <Link className="btn navy" to="/register-land">
            <FilePlus2 size={16} />
            Register land
          </Link>
        )}
        <Link className="btn secondary" to="/transactions">
          <History size={16} />
          Transactions
        </Link>
      </div>
      <WalletCard />
      <Notice error>{error}</Notice>
      {!error && !p.busy && (
        <div className="countergrid">
          {counters.map(([k, n]) => (
            <div className="paper" key={k}>
              <small>{k}</small>
              <strong>{n ?? "—"}</strong>
            </div>
          ))}
        </div>
      )}
      {buyer && (
        <div className="paper">
          <h3>Find a property</h3>
          <Lookup onSearch={(id) => nav("/verify?id=" + id)} />
        </div>
      )}
      {admin && <Trends rows={rows} />}
      <div className="paper">
        <h3>
          {admin ? "Recent registration applications" : "My property records"}
        </h3>
        {p.busy ? <p>Loading…</p> : <ParcelTable rows={rows.slice(0, 8)} />}
      </div>
      {admin && (
        <div className="paper">
          <h3>Transfers awaiting review</h3>
          {transfers.length ? (
            transfers.map((p) => (
              <p key={p.id}>
                <Link className="textlink" to={"/properties/" + p.id}>
                  {p.id} · Review transfer to {compact(p.proposed_wallet)}
                </Link>
              </p>
            ))
          ) : (
            <Empty>No transfers awaiting review.</Empty>
          )}
        </div>
      )}
      <div className="paper">
        <h3>Buyer transfer requests</h3>
        <RequestTable rows={r.data} user={user} />
      </div>
      {buyer && (
        <div className="paper">
          <h3>Recently viewed and verified</h3>
          {v.data?.length ? (
            v.data.map((i) => (
              <div key={i.property_id} className="listline">
                <Link className="textlink" to={"/verify?id=" + i.property_id}>
                  {i.property_id}
                </Link>
                <Status value={i.result} />
                <small>{date(i.viewed_at)}</small>
              </div>
            ))
          ) : (
            <Empty>Your property searches will appear here.</Empty>
          )}
        </div>
      )}
      <div className="paper">
        <h3>Recent blockchain activity</h3>
        <EventTable rows={events.data?.slice(0, 8)} config={config} />
      </div>
    </Page>
  );
}
export function Properties() {
  const { user } = useSession(),
    { data, busy, error } = useLoad("/properties"),
    [filter, setFilter] = useState("");
  return (
    <Page
      title={user.role === "ADMIN" ? "All properties" : "My properties"}
      desc="View application status, ownership and registration details."
    >
      <div className="paper">
        <Field label="Filter properties">
          <input
            placeholder="Property ID, location or status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Field>
        <Notice error>{error}</Notice>
        {busy ? (
          <p>Loading properties…</p>
        ) : (
          data && (
            <ParcelTable
              rows={data.filter((p) =>
                [p.id, p.location, p.status]
                  .join(" ")
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )}
            />
          )
        )}
      </div>
    </Page>
  );
}
export function RegisterLand() {
  const { user } = useSession(),
    nav = useNavigate(),
    action = useAction();
  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      details = Object.fromEntries(f);
    delete details.document;
    const doc = f.get("document");
    action.act(async () => {
      if (doc.size > 5242880) throw Error("The PDF must be 5 MB or smaller.");
      const body = new FormData();
      body.append(
        "details",
        new Blob([JSON.stringify(details)], { type: "application/json" }),
      );
      body.append("document", doc);
      const result = await api("/properties", { method: "POST", body });
      nav("/properties/" + result.id);
    });
  }
  return (
    <Page
      title="Register new land"
      desc="Submit your parcel details and supporting deed. The registry assigns the property ID and registration date."
    >
      <WalletCard />
      <form className="paper" onSubmit={submit}>
        <h3>Applicant and parcel details</h3>
        <div className="formgrid">
          <Field
            label="Owner’s full name"
            name="ownerName"
            defaultValue={user.name}
            maxLength={100}
          />
          <Field
            label="Identification reference"
            name="identityRef"
            maxLength={80}
          />
          {[
            ["Location / village", "location", 150],
            ["State", "state", 80],
            ["District", "district", 80],
            ["Survey number", "survey", 80],
          ].map(([label, name, max]) => (
            <Field key={name} {...{ label, name, maxLength: max }} />
          ))}
          <Field
            label="Land area (m²)"
            name="area"
            type="number"
            step=".01"
            min=".01"
            max="999999999999.99"
          />
          <Field label="Property type">
            <select name="propertyType">
              {["Agricultural", "Residential", "Commercial", "Industrial"].map(
                (i) => (
                  <option key={i}>{i}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <Field label="Land address">
          <textarea required name="address" maxLength={300} />
        </Field>
        <Field label="Supporting deed (PDF, up to 5 MB)">
          <input
            type="file"
            name="document"
            accept="application/pdf,.pdf"
            required
          />
        </Field>
        <Feedback action={action} />
        <button className="btn navy" disabled={!user.wallet || action.busy}>
          {action.busy ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </Page>
  );
}
export function Details() {
  const { id } = useParams(),
    { user, config } = useSession(),
    [rev, setRev] = useState(0),
    { data: p, error, busy } = useLoad("/properties/" + id, rev),
    action = useAction(),
    [reason, setReason] = useState("");
  const post = (path, body) =>
    api("/properties/" + id + "/" + path, { method: "POST", body });
  function review(kind) {
    action.act(async (report) => {
      if (kind === "reject") {
        await post("reject", { reason });
        report("Application rejected.");
      } else {
        const { writeChain } = await import("./wallet");
        if (kind === "approve") {
          const v = await post("approve");
          await writeChain(
            user,
            "registerProperty",
            [id, v.wallet, v.digest],
            report,
          );
        } else
          await writeChain(
            user,
            "reviewTransfer",
            [id, p.proposed_wallet, kind === "acceptTransfer"],
            report,
          );
      }
      setRev((n) => n + 1);
    });
  }
  return (
    <Page
      title="Property details"
      desc={id}
      actions={
        <button className="btn secondary" onClick={() => setRev((n) => n + 1)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      }
    >
      <Notice error>{error}</Notice>
      {busy && <p>Loading property…</p>}
      {p && (
        <>
          <div className="paper">
            <div className="sectionhead">
              <h2>{p.location}</h2>
              <Status value={p.status} />
            </div>
            <dl className="details">
              {[
                ["Original applicant", p.owner_name],
                ["Identification reference", p.identity_ref],
                ["Property ID", p.id],
                [
                  "Parcel address",
                  p.address + ", " + p.district + ", " + p.state,
                ],
                ["Survey number", p.survey],
                ["Area", p.area + " m²"],
                ["Property type", p.property_type],
                ["Submitted", date(p.created_at)],
                ["Current / applicant wallet", p.owner_wallet],
                ["Proposed new owner", p.proposed_wallet],
                ["Review note", p.review_note],
                [
                  "Title transaction",
                  p.tx_hash && <Explorer hash={p.tx_hash} config={config} />,
                ],
              ]
                .filter(([, value]) => value)
                .map(([k, value]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{value}</dd>
                  </React.Fragment>
                ))}
            </dl>
            <div className="actions">
              <button
                disabled={action.busy}
                className="btn secondary"
                onClick={() =>
                  action.act(() =>
                    download(
                      "/properties/" + id + "/document",
                      id + "-deed.pdf",
                    ),
                  )
                }
              >
                <Download size={16} />
                Supporting deed
              </button>
              {p.status === "APPROVED" && (
                <>
                  <button
                    className="btn secondary"
                    disabled={action.busy}
                    onClick={() =>
                      action.act(() =>
                        download(
                          "/properties/" + id + "/certificate",
                          id + "-certificate.txt",
                        ),
                      )
                    }
                  >
                    <Download size={16} />
                    Certificate
                  </button>
                  <Link className="btn secondary" to={"/verify?id=" + id}>
                    Verify title
                  </Link>
                  {p.owner_wallet === user.wallet && !p.proposed_wallet && (
                    <Link className="btn navy" to={"/transfer/" + id}>
                      Transfer ownership
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
          {user.role === "ADMIN" && ["PENDING", "READY"].includes(p.status) && (
            <div className="paper">
              <h3>Review registration</h3>
              <p>
                Inspect the deed and identity reference before signing the
                registration with the administrator wallet.
              </p>
              <button
                disabled={action.busy}
                className="btn navy"
                onClick={() => review("approve")}
              >
                {p.status === "READY"
                  ? "Sign registration"
                  : "Approve and sign registration"}
              </button>
              {p.status === "PENDING" && (
                <form
                  className="rejectform"
                  onSubmit={(e) => {
                    e.preventDefault();
                    review("reject");
                  }}
                >
                  <Field label="Reason for rejection">
                    <input
                      required
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <button disabled={action.busy} className="btn secondary">
                    Reject application
                  </button>
                </form>
              )}
            </div>
          )}
          {user.role === "ADMIN" && p.proposed_wallet && (
            <div className="paper">
              <h3>Review owner-authorized transfer</h3>
              <p className="mono">Recipient: {p.proposed_wallet}</p>
              <div className="actions">
                <button
                  disabled={action.busy}
                  className="btn navy"
                  onClick={() => review("acceptTransfer")}
                >
                  Approve transfer
                </button>
                <button
                  disabled={action.busy}
                  className="btn secondary"
                  onClick={() => review("rejectTransfer")}
                >
                  Reject transfer
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <Feedback action={action} />
      <Link className="textlink" to="/dashboard">
        Return to dashboard
      </Link>
    </Page>
  );
}
export function Transfer() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    { user } = useSession(),
    nav = useNavigate(),
    list = useLoad("/properties"),
    action = useAction();
  const owned =
    list.data?.filter(
      (p) =>
        p.owner_wallet === user.wallet &&
        p.status === "APPROVED" &&
        !p.proposed_wallet,
    ) || [];
  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    action.act(async (report) => {
      const target = f.get("property"),
        recipient = await api("/properties/" + target + "/recipient", {
          method: "POST",
          body: { wallet: f.get("wallet").trim() },
        });
      await (
        await import("./wallet")
      ).writeChain(
        user,
        "initiateTransfer",
        [target, recipient.wallet],
        report,
      );
    });
  }
  return (
    <Page
      title="Transfer ownership"
      desc="Sign a transfer proposal with the current owner’s wallet. The administrator reviews it before title changes."
    >
      <WalletCard />
      <Notice error>{list.error}</Notice>
      <div className="paper">
        {list.busy ? (
          <p>Loading properties…</p>
        ) : owned.length ? (
          <form onSubmit={submit}>
            <Field label="Registered property">
              <select name="property" defaultValue={id}>
                {owned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.location}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Buyer's linked Ethereum wallet"
              name="wallet"
              defaultValue={params.get("wallet") || ""}
              placeholder="0x…"
              pattern="0x[0-9a-fA-F]{40}"
            />
            <button className="btn navy" disabled={action.busy}>
              Sign transfer proposal
            </button>
          </form>
        ) : (
          <Empty>No properties available for a new transfer.</Empty>
        )}
        <Feedback action={action} />
      </div>
    </Page>
  );
}
