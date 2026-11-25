import React, { useState, useEffect, createContext, useContext } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Layers3, Search, Inbox } from "lucide-react";
import { api } from "./api";
export const Session = createContext({});
export const useSession = () => useContext(Session);
export function useLoad(path, revision = 0) {
  const [state, set] = useState({ busy: true });
  useEffect(() => {
    let active = true;
    if (!path) {
      set({ busy: false, data: null });
      return;
    }
    set({ busy: true });
    api(path)
      .then((data) => active && set({ data }))
      .catch((e) => active && set({ error: e.message }));
    return () => {
      active = false;
    };
  }, [path, revision]);
  return state;
}
export function Notice({ children, error = false }) {
  return children ? (
    <div
      className={"notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  ) : null;
}
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="LandLedger home">
      <span className="brandmark">
        <Layers3 size={28} />
      </span>
      <span>
        LandLedger<small>LAND REGISTRATION PORTAL</small>
      </span>
    </Link>
  );
}
export function Page({ title, desc, children, actions }) {
  return (
    <section className="container inner">
      <div className="crumb">
        <Link to="/">Home</Link> / {title}
      </div>
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          {desc && <p>{desc}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input required {...props} />}
    </label>
  );
}
export function Status({ value }) {
  return (
    <span className={"badge " + (value || "").toLowerCase()}>
      {{
        READY: "Awaiting blockchain",
        APPROVED: "Registered",
        REQUESTED: "Requested",
        NOT_FOUND: "Record not found",
      }[value] || value?.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Empty({ children }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Lookup({ onSearch, initial = "", busy = false }) {
  const [value, set] = useState(initial);
  return (
    <form
      className="lookup"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim().toUpperCase());
      }}
    >
      <label className="sr-only" htmlFor="parcel-search">
        Property ID
      </label>
      <Search size={20} />
      <input
        id="parcel-search"
        placeholder="Enter property ID"
        required
        maxLength={40}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <button className="btn navy" disabled={busy}>
        {busy ? "Checking…" : "Verify record"}
      </button>
    </form>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function act(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn(setMessage);
    } catch (e) {
      setError(e.shortMessage || e.message || "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, act };
}
export function Feedback({ action }) {
  return (
    <>
      <Notice>{action.message}</Notice>
      <Notice error>{action.error}</Notice>
    </>
  );
}
export function Explorer({ hash, config, children }) {
  if (!hash) return <span>Awaiting confirmation</span>;
  if (
    config?.available &&
    config.chainId === 11155111 &&
    /^0x[0-9a-fA-F]{64}$/.test(hash)
  )
    return (
      <a
        className="textlink"
        href={"https://sepolia.etherscan.io/tx/" + hash}
        target="_blank"
        rel="noreferrer"
      >
        {children || hash}
      </a>
    );
  if (children)
    return (
      <details className="hashdetail">
        <summary>{children}</summary>
        <code>{hash}</code>
      </details>
    );
  return <span>{hash}</span>;
}
