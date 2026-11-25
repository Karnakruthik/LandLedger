import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  Landmark,
  Activity,
  LogIn,
  Menu,
  X,
  LayoutDashboard,
  LogOut,
  HelpCircle,
} from "lucide-react";
import Home from "./Home";
import { Auth, Verify, Transactions, Information } from "./Public";
import {
  Dashboard,
  Properties,
  RegisterLand,
  Details,
  Transfer,
} from "./Workspace";
import { Brand, Session, useLoad, useSession, Page } from "./common";
import { tokenKey, api } from "./api";
import "./style.css";
function Guard({ children, role }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="container inner">Opening workspace…</div>;
  if (!user)
    return (
      <Navigate
        replace
        to="/login"
        state={{ from: location.pathname + location.search }}
      />
    );
  if (role && user.role !== role)
    return (
      <Page title="Landowner access">
        <p>
          Land registration is available to accounts registered as landowners.
        </p>
        <Link className="btn navy" to="/dashboard">
          Open dashboard
        </Link>
      </Page>
    );
  return children;
}
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(!!sessionStorage.getItem(tokenKey)),
    [menu, setMenu] = useState(false),
    [rev, setRev] = useState(0);
  const { data: config, error: configError } = useLoad("/public/config", rev);
  const path = useLocation().pathname;
  useEffect(() => {
    const timer = setInterval(() => setRev((x) => x + 1), 30000);
    function end() {
      setUser(null);
    }
    window.addEventListener("session-ended", end);
    if (sessionStorage.getItem(tokenKey))
      api("/me")
        .then(setUser)
        .catch(() => {})
        .finally(() => setLoading(false));
    return () => {
      clearInterval(timer);
      window.removeEventListener("session-ended", end);
    };
  }, []);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [path]);
  const signout = () => {
    sessionStorage.removeItem(tokenKey);
    setUser(null);
    setMenu(false);
  };
  const links = [
    ["/", "Home"],
    ["/verify", "Verify ownership"],
    ["/transactions", "Transactions"],
    ["/about", "About"],
  ];
  return (
    <Session.Provider value={{ user, setUser, config, loading }}>
      <div className="utility">
        <div className="container">
          <span>
            <Landmark size={14} /> Digital land registry
          </span>
          <span>
            <i className={"dot " + (config?.available ? "online" : "")} />
            {config?.available
              ? config.network === "sepolia"
                ? "Sepolia testnet"
                : "Local Ethereum network"
              : "Blockchain " +
                (config || configError ? "offline" : "status pending")}
          </span>
        </div>
      </div>
      <header>
        <div className="container navwrap">
          <Brand />
          <nav className={menu ? "open" : ""} aria-label="Main navigation">
            {links.map(([to, label]) => (
              <NavLink end key={to} to={to}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="navbuttons">
            <Link
              className="btn navy navlogin"
              to={user ? "/dashboard" : "/login"}
            >
              {user ? <LayoutDashboard size={17} /> : <LogIn size={17} />}{" "}
              {user ? "Dashboard" : "Sign in"}
            </Link>
            {user && (
              <button className="iconbtn" title="Sign out" onClick={signout}>
                <LogOut size={17} />
              </button>
            )}
            <button
              className="iconbtn hamburger"
              aria-label="Toggle menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<Information />} />
          <Route path="/help" element={<Information help />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/signup" element={<Auth signup />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/transactions" element={<Transactions />} />
          {[
            ["/dashboard", <Dashboard />],
            ["/properties", <Properties />],
            ["/properties/:id", <Details />],
            ["/transfer/:id?", <Transfer />],
            ["/register-land", <RegisterLand />],
          ].map(([route, el]) => (
            <Route
              key={route}
              path={route}
              element={
                <Guard role={route === "/register-land" ? "LANDOWNER" : null}>
                  {el}
                </Guard>
              }
            />
          ))}
          <Route
            path="*"
            element={
              <Page title="Page not found">
                <Link to="/">Return home</Link>
              </Page>
            }
          />
        </Routes>
      </main>
      <footer>
        <div className="container">
          <Brand />
          <span>Blockchain Technology · Academic project</span>
          <Link to="/help">
            <HelpCircle size={16} />
            Help centre
          </Link>
        </div>
      </footer>
    </Session.Provider>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
