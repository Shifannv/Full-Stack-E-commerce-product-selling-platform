import { RoleDashboard } from "@/components/layout/role-dashboard";
import { OperatorGate, OperatorWorkspace } from "@/components/layout/operator-workspace";

export default function SuperAdminPage() {
  return <OperatorGate role="super-admin"><RoleDashboard role="super-admin" /><OperatorWorkspace role="super-admin" /></OperatorGate>;
}
