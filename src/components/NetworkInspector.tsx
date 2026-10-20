import { useEffect, useMemo, useState } from "react";
import type {
  Header,
  NetworkCaptureEntry,
  NetworkCaptureStatus,
} from "../../electron/types";
import {
  filterNetworkRequests,
  redactNetworkRequest,
  type NetworkRequestFilters,
} from "../utils/networkInspector";

type InspectorTab =
  | "Overview"
  | "Request Headers"
  | "Request Body"
  | "Response Headers"
  | "Response Body"
  | "Timing"
  | "Connection";

const tabs: InspectorTab[] = [
  "Overview",
  "Request Headers",
  "Request Body",
  "Response Headers",
  "Response Body",
  "Timing",
  "Connection",
];

const emptyFilters: NetworkRequestFilters = {
  hostname: "",
  url: "",
  method: "",
  status: "",
  contentType: "",
  failedOnly: false,
  timeRange: "all",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formattedBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function HeaderTable({
  headers,
  notify,
}: {
  headers: Header[];
  notify: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = headers.filter(([name, value]) =>
    `${name} ${value}`.toLowerCase().includes(search.toLowerCase()),
  );
  const copy = async (value: string) => {
    const copied = await window.developerUtility.clipboard.copy(value);
    notify(copied ? "Header copied" : "Clipboard unavailable");
  };
  return (
    <div className="network-inspector-section">
      <input
        aria-label="Search headers"
        placeholder="Search headers"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {visible.length ? (
        <div className="network-header-table">
          {visible.map(([name, value], index) => (
            <div className="network-header-row" key={`${name}-${index}`}>
              <strong>{name}</strong>
              <span>{value}</span>
              <button
                type="button"
                className="secondary"
                onClick={() => void copy(`${name}: ${value}`)}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="network-muted">No matching headers.</p>
      )}
    </div>
  );
}

function BodyView({
  title,
  body,
  notify,
}: {
  title: string;
  body: string;
  notify: (message: string) => void;
}) {
  const copy = async () => {
    const copied = await window.developerUtility.clipboard.copy(body);
    notify(copied ? `${title} copied` : "Clipboard unavailable");
  };
  return (
    <div className="network-inspector-section">
      <div className="network-detail-heading">
        <strong>{title}</strong>
        <button
          type="button"
          className="secondary"
          disabled={!body}
          onClick={() => void copy()}
        >
          Copy
        </button>
      </div>
      <pre className="network-body">{body || "No body captured."}</pre>
    </div>
  );
}

export function NetworkInspector({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [status, setStatus] = useState<NetworkCaptureStatus>({
    state: "stopped",
    connectivityTest: "not-started",
  });
  const [requests, setRequests] = useState<NetworkCaptureEntry[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeTab, setActiveTab] = useState<InspectorTab>("Overview");
  const [filters, setFilters] = useState<NetworkRequestFilters>(emptyFilters);
  const [portInput, setPortInput] = useState("0");
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);
  const [selectedLanAddress, setSelectedLanAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = window.developerUtility.networkInspector.onRequest((request) => {
      if (!mounted) return;
      setRequests((previous) => {
        const next = previous.filter((item) => item.id !== request.id);
        next.unshift(request);
        return next.slice(0, 1000);
      });
      setSelectedId((current) => current || request.id);
    });
    void Promise.all([
      window.developerUtility.networkInspector.status(),
      window.developerUtility.networkInspector.requests(),
      window.developerUtility.networkInspector.lanAddresses(),
    ]).then(([nextStatus, currentRequests, addresses]) => {
      if (!mounted) return;
      setStatus(nextStatus);
      if (nextStatus.port !== undefined) setPortInput(String(nextStatus.port));
      setLanAddresses(addresses);
      setSelectedLanAddress((current) => current || addresses[0] || "");
      setRequests((previous) => {
        const byId = new Map(currentRequests.map((request) => [request.id, request]));
        for (const request of previous) byId.set(request.id, request);
        return [...byId.values()]
          .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
          .slice(0, 1000);
      });
      setSelectedId((current) => current || currentRequests[0]?.id || "");
    }).catch((error: unknown) => {
      if (mounted) notify(`Unable to load capture state: ${String(error)}`);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [notify]);

  const filteredRequests = useMemo(
    () =>
      filterNetworkRequests(requests, filters).sort(
        (left, right) => right.timestamp.localeCompare(left.timestamp),
      ),
    [filters, requests],
  );
  const selected = requests.find((request) => request.id === selectedId);
  const errorCount = requests.filter(
    (request) => Boolean(request.error) || (request.responseStatus ?? 0) >= 400,
  ).length;
  const proxyLanAddress =
    status.state === "listening" &&
      status.bindAddress !== "127.0.0.1" &&
      status.bindAddress !== "::1"
      ? status.bindAddress
      : undefined;

  const startCapture = async () => {
    const port = Number(portInput);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      notify("Enter a proxy port between 0 and 65535");
      return;
    }
    setBusy(true);
    try {
      const nextStatus = await window.developerUtility.networkInspector.start(port);
      setStatus(nextStatus);
      if (nextStatus.port !== undefined) setPortInput(String(nextStatus.port));
      notify(nextStatus.state === "listening"
        ? `Proxy listening at ${nextStatus.endpoint}`
        : nextStatus.message ?? "Unable to start proxy");
    } catch (error) {
      notify(`Unable to start proxy: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const stopCapture = async () => {
    setBusy(true);
    try {
      setStatus(await window.developerUtility.networkInspector.stop());
      notify("Capture stopped");
    } catch (error) {
      notify(`Unable to stop proxy: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const clearSession = async () => {
    try {
      const count = await window.developerUtility.networkInspector.clear();
      setRequests([]);
      setSelectedId("");
      notify(`Cleared ${count} captured ${count === 1 ? "request" : "requests"}`);
    } catch (error) {
      notify(`Unable to clear capture session: ${String(error)}`);
    }
  };

  const exportSession = async () => {
    try {
      const content = JSON.stringify(
        filteredRequests.map(redactNetworkRequest),
        null,
        2,
      );
      const saved = await window.developerUtility.files.save(content, ".json");
      notify(saved ? "Redacted JSON export saved" : "Export cancelled");
    } catch (error) {
      notify(`Unable to export requests: ${String(error)}`);
    }
  };

  const updateFilter = <K extends keyof NetworkRequestFilters>(
    key: K,
    value: NetworkRequestFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));

  const copyMobileValue = async (value: string, label: string) => {
    const copied = await window.developerUtility.clipboard.copy(value);
    notify(copied ? `${label} copied` : "Clipboard unavailable");
  };

  const enableLanAccess = async () => {
    if (!selectedLanAddress || !lanAddresses.includes(selectedLanAddress)) {
      notify("Select an available PC LAN IPv4 address first");
      return;
    }
    const requestedPort = status.state === "listening" ? status.port : Number(portInput);
    if (requestedPort === undefined || !Number.isInteger(requestedPort) ||
      requestedPort < 0 || requestedPort > 65535) {
      notify("Enter a valid proxy port (0 requests a dynamic port)");
      return;
    }
    setBusy(true);
    try {
      const nextStatus = await window.developerUtility.networkInspector.configureLan(
        requestedPort,
        selectedLanAddress,
      );
      setStatus(nextStatus);
      if (nextStatus.port) setPortInput(String(nextStatus.port));
      notify(nextStatus.state === "listening" && nextStatus.bindAddress === selectedLanAddress
        ? `LAN proxy enabled at ${selectedLanAddress}:${nextStatus.port}`
        : nextStatus.message ?? "LAN access was not enabled");
    } catch (error) {
      notify(`Unable to enable LAN access: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const returnToLoopback = async () => {
    if (status.state !== "listening" || status.bindAddress === "127.0.0.1") return;
    setBusy(true);
    try {
      const port = status.port;
      await window.developerUtility.networkInspector.stop();
      const nextStatus = await window.developerUtility.networkInspector.start(
        port,
        "127.0.0.1",
      );
      setStatus(nextStatus);
      if (nextStatus.port) setPortInput(String(nextStatus.port));
      if (nextStatus.state !== "listening" || nextStatus.bindAddress !== "127.0.0.1" || !nextStatus.port) {
        throw new Error(nextStatus.message ?? "Could not restore the loopback-only proxy listener.");
      }
      notify("Proxy returned to loopback-only access");
    } catch (error) {
      notify(`Unable to return proxy to loopback: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const beginMobileConnectivityTest = async () => {
    try {
      const nextStatus = await window.developerUtility.networkInspector.beginConnectivityTest();
      setStatus(nextStatus);
      notify("Open the displayed local test URL on the phone before the check times out");
    } catch (error) {
      notify(`Unable to start mobile connectivity test: ${String(error)}`);
    }
  };

  useEffect(() => {
    if (status.connectivityTest !== "waiting") return;
    const timer = window.setInterval(() => {
      void window.developerUtility.networkInspector.status().then(setStatus).catch((error: unknown) => {
        notify(`Unable to refresh mobile connection test: ${String(error)}`);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [notify, status.connectivityTest]);

  return (
    <div className="network-inspector">
      <div className="network-toolbar">
        <div className="network-capture-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || status.state === "listening"}
            onClick={() => void startCapture()}
          >
            Start Capture
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || status.state !== "listening"}
            onClick={() => void stopCapture()}
          >
            Stop Capture
          </button>
          <label className="network-port">
            Requested port (0 = automatic)
            <input
              aria-label="Proxy port"
              inputMode="numeric"
              value={portInput}
              onChange={(event) => setPortInput(event.target.value)}
              disabled={status.state === "listening"}
            />
          </label>
        </div>
        <div className="network-status-line">
          <span className={`network-status-dot ${status.state}`} />
          <strong>{status.state === "listening" ? "Capturing" : status.state}</strong>
          <span>
            {status.state === "listening" && status.port
              ? `Proxy bind ${status.bindAddress ?? status.host ?? "unknown"} · actual port ${status.port} · ${status.endpoint}`
              : "Loopback only · port 0 requests dynamic allocation (not a proxy port)"}
          </span>
        </div>
        <div className="network-session-actions">
          <span>{requests.length} requests</span>
          <span>{errorCount} errors</span>
          <button type="button" className="secondary" onClick={() => void exportSession()}>
            Export redacted JSON
          </button>
          <button type="button" className="secondary" onClick={() => void clearSession()}>
            Clear Session
          </button>
        </div>
        {status.state === "error" && (
          <div className="network-error" role="alert">
            Proxy failed: {status.message ?? "Unknown startup error"}
          </div>
        )}
      </div>

      <section className="network-mobile-panel" aria-label="Mobile device setup">
        <div className="network-mobile-heading">
          <div>
            <strong>Mobile Device Setup</strong>
            <small>Manual Wi-Fi proxy · Android and iOS</small>
          </div>
          <span className={`network-status-dot ${status.state}`} />
          <strong>{status.state === "listening" ? "Proxy running" : status.state}</strong>
        </div>
        <div className="network-mobile-config">
          <label>
            PC LAN IPv4 address
            <select
              aria-label="PC LAN IPv4 address"
              value={selectedLanAddress}
              onChange={(event) => setSelectedLanAddress(event.target.value)}
            >
              <option value="">Select a PC LAN address</option>
              {lanAddresses.map((address) => (
                <option value={address} key={address}>{address}</option>
              ))}
            </select>
          </label>
          <div className="network-mobile-value">
            <span>LAN listener address</span>
            <strong>{proxyLanAddress || "Not bound to LAN"}</strong>
            <button
              type="button"
              className="secondary"
              disabled={!proxyLanAddress}
              onClick={() => void copyMobileValue(proxyLanAddress ?? "", "LAN address")}
            >
              Copy IP
            </button>
          </div>
          <div className="network-mobile-value">
            <span>Actual proxy port</span>
            <strong>{status.state === "listening" && status.port ? status.port : "Proxy not listening"}</strong>
            <button
              type="button"
              className="secondary"
              disabled={status.state !== "listening" || !status.port}
              onClick={() => void copyMobileValue(String(status.port), "Proxy port")}
            >
              Copy port
            </button>
          </div>
          <div className="network-mobile-actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !selectedLanAddress || !lanAddresses.includes(selectedLanAddress)}
              onClick={() => void enableLanAccess()}
            >
              Enable LAN Access
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || status.state !== "listening" ||
                status.bindAddress === "127.0.0.1" || status.bindAddress === "::1"}
              onClick={() => void returnToLoopback()}
            >
              Return to Loopback Only
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || status.state !== "listening" ||
                !proxyLanAddress || proxyLanAddress !== selectedLanAddress || !status.port}
              onClick={() => void beginMobileConnectivityTest()}
            >
              Start Connection Test
            </button>
            {proxyLanAddress && status.port && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void copyMobileValue(`${proxyLanAddress}:${status.port}`, "Proxy address")
                  }
                >
                  Copy IP and port
                </button>
              )}
          </div>
        </div>
        {status.state === "listening" ? (
          <p className="network-mobile-status">
            Bound to <strong>{status.bindAddress ?? status.host}</strong> on actual port{" "}
            <strong>{status.port}</strong>.{" "}
            {status.bindAddress === "127.0.0.1" || status.bindAddress === "::1"
              ? "This is loopback-only; phones cannot reach the proxy until LAN access is enabled."
              : "LAN access is enabled. Other devices on this network may reach this unauthenticated proxy."}
          </p>
        ) : (
          <p className="network-mobile-status">
            {status.state === "error"
              ? `Proxy unavailable: ${status.message ?? "listener failed"}`
              : "The proxy is stopped. Start Capture to serve PC browser traffic, or enable LAN access above for phones."}
          </p>
        )}
        {lanAddresses.length === 0 && (
          <p className="network-mobile-warning">
            No reachable LAN IPv4 address was detected. Connect this PC to Wi-Fi or Ethernet; do not use a loopback address on the phone.
          </p>
        )}
        {status.connectivityTest !== "not-started" && (
          <div className="network-mobile-test" role="status">
            Local proxy connectivity check: <strong>{status.connectivityTest}</strong>
            {status.connectivityTestMessage ? ` · ${status.connectivityTestMessage}` : ""}
            {status.connectivityTestAt
              ? ` · verified ${new Date(status.connectivityTestAt).toLocaleTimeString()}`
              : ""}
            {status.connectivityTest === "waiting" && status.port && proxyLanAddress && (
              <p>
                On the phone, open{" "}
                <code>http://{proxyLanAddress}:{status.port}/__developer-utility-connectivity-check</code>
              </p>
            )}
          </div>
        )}
        <details className="network-mobile-instructions">
          <summary>Android and iOS setup, HTTPS, and troubleshooting</summary>
          <div>
            <p><strong>Before setup:</strong> Connect the phone and PC to the same Wi-Fi network. Enable LAN Access above and use the selected PC LAN IPv4 plus the actual proxy port shown here. A LAN address alone does not mean the proxy is bound to it.</p>
            <p><strong>Android:</strong> Open the connected Wi-Fi network’s edit/details screen, choose the pencil or Edit action, expand Advanced options, set Proxy to Manual, then enter the PC LAN address as Proxy hostname and the displayed port. Save and reconnect if needed.</p>
            <p><strong>iOS:</strong> Open Settings → Wi-Fi → tap the information button for the connected network → Configure Proxy → Manual. Enter the PC LAN address and port, then Save.</p>
            <p><strong>Verify:</strong> Start Connection Test and open the displayed local URL on the phone. To see a real captured request, keep Capture running and visit <code>http://neverssl.com/</code>; the HTTP request should appear in the request list. If capture does not appear, confirm the proxy fields, shared Wi-Fi, PC firewall access, and that LAN Access is still enabled.</p>
            <p><strong>HTTPS:</strong> This proxy tunnels HTTPS CONNECT traffic without decrypting it. It does not provide a development CA or HTTPS interception, so installing a certificate will not enable HTTPS request/body inspection. Even with interception available, apps may reject user certificates or enforce pinning; this app does not bypass those controls.</p>
            <p><strong>When finished:</strong> Set the phone’s Wi-Fi proxy back to None/Off, remove any test certificate you separately installed, and choose Return to Loopback Only. LAN mode is unauthenticated and should be enabled only on a trusted network.</p>
            <p><strong>Troubleshooting:</strong> If no LAN address is listed, connect the PC to a network. If binding fails, select an address belonging to the active Wi-Fi/Ethernet interface and check whether another process owns the port. If the test times out, check phone/PC network isolation, guest Wi-Fi rules, firewall prompts, and the exact address/port. VPN connections, client isolation, and some mobile apps may ignore or block Wi-Fi proxies.</p>
          </div>
        </details>
      </section>

      <div className="network-filters">
        <input
          aria-label="Filter hostname"
          placeholder="Hostname"
          value={filters.hostname}
          onChange={(event) => updateFilter("hostname", event.target.value)}
        />
        <input
          aria-label="Filter URL"
          placeholder="URL or path"
          value={filters.url}
          onChange={(event) => updateFilter("url", event.target.value)}
        />
        <select
          aria-label="Filter method"
          value={filters.method}
          onChange={(event) => updateFilter("method", event.target.value)}
        >
          <option value="">All methods</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT"].map(
            (method) => <option key={method}>{method}</option>,
          )}
        </select>
        <input
          aria-label="Filter status code"
          placeholder="Status"
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
        />
        <input
          aria-label="Filter content type"
          placeholder="Content type"
          value={filters.contentType}
          onChange={(event) => updateFilter("contentType", event.target.value)}
        />
        <select
          aria-label="Filter time range"
          value={filters.timeRange}
          onChange={(event) =>
            updateFilter("timeRange", event.target.value as NetworkRequestFilters["timeRange"])
          }
        >
          <option value="all">All time</option>
          <option value="5m">Last 5 minutes</option>
          <option value="1h">Last hour</option>
          <option value="24h">Last 24 hours</option>
        </select>
        <label className="network-failed-filter">
          <input
            type="checkbox"
            checked={filters.failedOnly}
            onChange={(event) => updateFilter("failedOnly", event.target.checked)}
          />
          Failed
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => setFilters(emptyFilters)}
        >
          Clear filters
        </button>
      </div>

      <div className="network-workspace">
        <section className="network-request-panel" aria-label="Captured requests">
          <div className="network-panel-heading">
            <strong>Requests</strong>
            <span>{filteredRequests.length}</span>
          </div>
          <div className="network-request-list">
            {filteredRequests.map((request) => (
              <button
                type="button"
                key={request.id}
                className={request.id === selectedId ? "network-request selected" : "network-request"}
                onClick={() => setSelectedId(request.id)}
              >
                <span className={`network-method ${request.method.toLowerCase()}`}>
                  {request.method}
                </span>
                <span className="network-request-main">
                  <strong>{request.hostname}</strong>
                  <small>{request.path}</small>
                </span>
                <span className="network-request-meta">
                  <strong className={(request.error || (request.responseStatus ?? 0) >= 400)
                    ? "network-bad-status"
                    : ""}
                  >
                    {request.error ? "ERR" : request.responseStatus ?? "…"}
                  </strong>
                  <small>
                    {new Date(request.timestamp).toLocaleTimeString()}
                    {request.durationMs === undefined
                      ? " · Pending"
                      : ` · ${request.durationMs} ms · ${formatBytes(request.responseSize)}`}
                  </small>
                </span>
              </button>
            ))}
            {filteredRequests.length === 0 && (
              <div className="network-empty">
                <strong>
                  {requests.length ? "No requests match these filters" : "No requests captured"}
                </strong>
                <p>
                  {status.state === "listening"
                    ? "Configure a local browser to use the loopback proxy shown above, then make an HTTP request."
                    : "Start capture, then configure a browser on this computer to use the proxy endpoint."}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="network-detail-panel" aria-label="Request details">
          {selected ? (
            <>
              <div className="network-selected-heading">
                <span className="network-method">{selected.method}</span>
                <strong title={selected.url}>{selected.url}</strong>
                <span className={selected.error ? "network-bad-status" : ""}>
                  {selected.error
                    ? "Error"
                    : selected.responseStatus ?? "Pending"}
                </span>
              </div>
              <div className="network-tabs" role="tablist" aria-label="Request detail sections">
                {tabs.map((tab) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    key={tab}
                    className={activeTab === tab ? "active" : ""}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="network-detail-content">
                {activeTab === "Overview" && (
                  <dl className="network-overview">
                    <dt>URL</dt><dd>{selected.url}</dd>
                    <dt>Method</dt><dd>{selected.method}</dd>
                    <dt>Status</dt><dd>{selected.responseStatus ?? "Pending"}</dd>
                    <dt>Content type</dt><dd>{selected.contentType ?? "Unknown"}</dd>
                    <dt>Request size</dt><dd>{formatBytes(selected.requestSize)}</dd>
                    <dt>Response size</dt><dd>{formatBytes(selected.responseSize)}</dd>
                    <dt>Started</dt><dd>{new Date(selected.timestamp).toLocaleString()}</dd>
                    <dt>Query parameters</dt>
                    <dd>
                      {new URLSearchParams(selected.queryParams).size
                        ? [...new URLSearchParams(selected.queryParams)].map(([key, value]) =>
                            <div key={`${key}-${value}`}><strong>{key}</strong>: {value}</div>,
                          )
                        : "None"}
                    </dd>
                    {selected.error && <><dt>Connection error</dt><dd>{selected.error}</dd></>}
                  </dl>
                )}
                {activeTab === "Request Headers" && (
                  <HeaderTable headers={selected.requestHeaders} notify={notify} />
                )}
                {activeTab === "Response Headers" && (
                  <HeaderTable headers={selected.responseHeaders} notify={notify} />
                )}
                {activeTab === "Request Body" && (
                  <BodyView
                    title="Request body"
                    body={formattedBody(selected.requestBody)}
                    notify={notify}
                  />
                )}
                {activeTab === "Response Body" && (
                  <BodyView
                    title="Response body"
                    body={formattedBody(selected.responseBody)}
                    notify={notify}
                  />
                )}
                {activeTab === "Timing" && (
                  <dl className="network-overview">
                    <dt>Duration</dt>
                    <dd>{selected.durationMs === undefined ? "Pending" : `${selected.durationMs} ms`}</dd>
                    <dt>Request payload</dt><dd>{formatBytes(selected.requestSize)}</dd>
                    <dt>Response payload</dt><dd>{formatBytes(selected.responseSize)}</dd>
                  </dl>
                )}
                {activeTab === "Connection" && (
                  <dl className="network-overview">
                    <dt>Capture protocol</dt><dd>{selected.protocol}</dd>
                    <dt>Destination</dt><dd>{selected.hostname}</dd>
                    <dt>TLS decryption</dt>
                    <dd>{selected.protocol === "https-tunnel"
                      ? "Not enabled; encrypted CONNECT tunnel only"
                      : "Not applicable to this HTTP request"}
                    </dd>
                    <dt>Connection error</dt><dd>{selected.error ?? "None reported"}</dd>
                  </dl>
                )}
              </div>
            </>
          ) : (
            <div className="network-empty">
              <strong>Select a captured request</strong>
              <p>Request and response details will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
