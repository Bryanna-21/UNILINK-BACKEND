import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Rightbar from "../components/Rightbar";
import EmergencyMenu from "../components/EmergencyMenu";

export default function MainLayout({ children }) {
  return (
    <>
      <Navbar />

      <div className="main">
        <Sidebar />
        <div className="content">{children}</div>
        <Rightbar />
      </div>

      {/* GLOBAL EMERGENCY BUTTON */}
      <EmergencyMenu />
    </>
  );
}
