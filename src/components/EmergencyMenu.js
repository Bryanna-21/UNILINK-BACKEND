import { useState, useEffect } from "react";
import API from "../services/api";
import {
  FaPhone,
  FaHospital,
  FaHeartbeat,
  FaSignOutAlt,
  FaExclamationTriangle
} from "react-icons/fa";

export default function EmergencyMenu() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  // 🔐 logout
  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  // 📞 load contacts
  const loadContacts = async () => {
    try {
      const res = await API.get("/emergency/contacts");
      setContacts(res.data);
    } catch (err) {
      console.error("Failed to load contacts", err);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  // 🚨 report issue
  const reportIssue = async () => {
    const message = prompt("Describe the issue:");
    if (!message) return;

    try {
      setLoading(true);

      await API.post("/emergency/report", {
        type: "general",
        message,
        location: "unknown"
      });

      alert("Report sent successfully.");
    } catch (err) {
      alert("Failed to send report.");
    } finally {
      setLoading(false);
    }
  };

  // 🆘 request help
  const requestHelp = async () => {
    try {
      setLoading(true);

      await API.post("/emergency/help");

      alert("Help request sent.");
    } catch (err) {
      alert("Failed to request help.");
    } finally {
      setLoading(false);
    }
  };

  // 🏥 hospital map
  const openHospitalMap = () => {
    window.open("https://www.google.com/maps/search/hospital+near+me");
  };

  return (
    <>
      {/* FLOATING BUTTON */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "red",
          color: "white",
          padding: "16px",
          borderRadius: "50%",
          cursor: "pointer",
          zIndex: 1000,
          fontSize: "18px"
        }}
      >
        ⚠️
      </div>

      {/* MENU */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            right: "20px",
            width: "260px",
            background: "white",
            borderRadius: "10px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            padding: "10px",
            zIndex: 1000
          }}
        >
          <h4 style={{ margin: "5px 10px" }}>Emergency</h4>

          {/* CONTACTS */}
          {contacts.length === 0 ? (
            <p style={item}>Loading contacts...</p>
          ) : (
            contacts.map((c, i) => (
              <p key={i} style={item}>
                <FaPhone />
                {c.name}:{" "}
                <a href={`tel:${c.phone}`} style={{ color: "blue" }}>
                  {c.phone}
                </a>
              </p>
            ))
          )}

          {/* ACTIONS */}
          <p style={item} onClick={openHospitalMap}>
            <FaHospital /> Nearby Hospitals
          </p>

          <p style={item} onClick={requestHelp}>
            <FaHeartbeat /> Request Help
          </p>

          <hr />

          <p style={item} onClick={reportIssue}>
            <FaExclamationTriangle /> Report Issue
          </p>

          <p style={item} onClick={logout}>
            <FaSignOutAlt /> Logout
          </p>

          {loading && (
            <p style={{ padding: "10px", fontSize: "12px" }}>
              Processing...
            </p>
          )}
        </div>
      )}
    </>
  );
}

const item = {
  padding: "10px",
  cursor: "pointer",
  display: "flex",
  gap: "10px",
  alignItems: "center"
};
