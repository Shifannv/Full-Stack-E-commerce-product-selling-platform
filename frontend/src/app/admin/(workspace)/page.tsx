import { RoleDashboard } from "@/components/layout/role-dashboard";
import { OperatorGate, OperatorWorkspace } from "@/components/layout/operator-workspace";

export default function AdminPage() {
  return <OperatorGate role="admin"><RoleDashboard role="admin" /><OperatorWorkspace role="admin" /></OperatorGate>;
}
