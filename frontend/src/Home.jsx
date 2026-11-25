import React from "react";
import { Link } from "react-router-dom";
import {
  Landmark,
  ScanLine,
  MapPinned,
  ShieldCheck,
  Repeat2,
  Boxes,
  FilePlus2,
  FileCheck2,
  History,
  ChevronRight,
  Compass,
  Layers3,
  MapPin,
  Database,
  Link2,
} from "lucide-react";
import { useLoad, useSession } from "./common";
const services = [
  [
    FilePlus2,
    "Land registration",
    "Submit your land details and supporting documents for administrative review.",
    "Register land",
    "/register-land",
  ],
  [
    ScanLine,
    "Ownership verification",
    "Check a property ID against its on-chain record and confirm the current owner.",
    "Verify a record",
    "/verify",
  ],
  [
    History,
    "Transaction history",
    "Trace registrations and ownership changes through the public transaction register.",
    "View transactions",
    "/transactions",
  ],
];
export default function Home() {
  const { data: stats, error } = useLoad("/public/stats");
  const { config } = useSession();
  return (
    <>
      <section className="hero">
        <div
          className="hero-art"
          role="img"
          aria-label="Three-dimensional survey map with gold parcel boundaries and survey pins"
        />
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="eyebrow gold">
              <span /> BLOCKCHAIN LAND REGISTRY
            </div>
            <h1>
              Secure Land Ownership
              <br />
              Through <em>Blockchain</em>
              <br />
              Technology
            </h1>
            <p>
              A transparent, secure, and tamper-resistant digital land
              registration platform powered by blockchain.
            </p>
            <div className="actions">
              <Link className="btn goldbtn" to="/register-land">
                <FilePlus2 size={18} />
                Register Your Land
              </Link>
              <Link className="btn ghost" to="/verify">
                <ScanLine size={18} />
                Verify Land Ownership
              </Link>
            </div>
          </div>
          <div className="map-caption">
            <span className="caption-icon">
              <Compass size={22} />
            </span>
            <div>
              <strong>Cadastral survey</strong>
              <small>Parcel boundary visualization</small>
            </div>
          </div>
        </div>
      </section>
      <section className="container section">
        <div className="sectionhead">
          <div>
            <div className="eyebrow">
              <span /> REGISTRY INSIGHTS
            </div>
            <h2>Registry overview</h2>
          </div>
          <span className="subnote">
            <Database size={15} />
            {error
              ? "Data unavailable"
              : stats
                ? "Registry database"
                : "Loading records"}
          </span>
        </div>
        <div className="metrics">
          {[
            [MapPinned, "Registered properties", "approved"],
            [ShieldCheck, "Verified properties", "verified"],
            [Repeat2, "Completed transfers", "transfers"],
            [Boxes, "Blockchain transactions", "transactions"],
          ].map(([Icon, label, key]) => (
            <div className="metric" key={key}>
              <span className="iconbox">
                <Icon size={23} />
              </span>
              <div>
                <strong>{stats ? stats[key].toLocaleString() : "—"}</strong>
                <small>{label}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container services section">
        <div className="eyebrow">
          <span /> PORTAL SERVICES
        </div>
        <h2>Land registry services</h2>
        <div className="servicegrid">
          {services.map(([Icon, title, desc, label, to]) => (
            <article key={to}>
              <Icon className="serviceicon" size={27} strokeWidth={1.65} />
              <h3>{title}</h3>
              <p>{desc}</p>
              <Link to={to}>
                {label}
                <ChevronRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="container section">
        <div className="how">
          <div>
            <div className="eyebrow gold">
              <span /> RECORD INTEGRITY
            </div>
            <h2>How blockchain protects your title</h2>
          </div>
          <div className="howsteps">
            {[
              [
                FileCheck2,
                "Review",
                "An administrator checks the application and deed.",
              ],
              [
                Link2,
                "Anchor",
                "Ethereum records the owner’s wallet and a SHA-256 commitment.",
              ],
              [
                ShieldCheck,
                "Verify",
                "A fresh digest reveals changes to the stored record.",
              ],
            ].map(([Icon, t, d]) => (
              <div key={t}>
                <Icon />
                <strong>{t}</strong>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
