import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { listBranches, listOrganizations, type BranchRow, type OrgRow } from './api';
import { useSession } from './session';

interface TenantCtx {
  org: OrgRow | null;
  orgs: OrgRow[];              // orgs visible to the current user
  branch: BranchRow | null;     // null = "All branches" overview
  branches: BranchRow[];        // branches under the current org, scoped to user
  loading: boolean;
  setOrg: (orgId: string) => void;
  setBranch: (branchId: string | null) => void;
  /**
   * Restaurant IDs to filter queries by. When `branch` is set, this is just
   * [branch.id]. When `branch` is null (All), it's all branches the user can see
   * under the current org.
   */
  scopedRestaurantIds: string[];
}

const Ctx = createContext<TenantCtx | null>(null);
const STORAGE_KEY = 'foodcourt-tenant-v2';

interface Stored { orgId: string | null; branchId: string | null }

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { orgId: null, branchId: null };
}
function save(s: Stored) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { admin, state } = useSession();
  const [allOrgs, setAllOrgs] = useState<OrgRow[]>([]);
  const [allBranches, setAllBranches] = useState<BranchRow[]>([]);
  const [{ orgId, branchId }, setStored] = useState<Stored>(() => load());
  const [loading, setLoading] = useState(true);

  useEffect(() => { save({ orgId, branchId }); }, [orgId, branchId]);

  // Load orgs + all branches once on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([listOrganizations(), listBranches()])
      .then(([os, bs]) => {
        if (cancelled) return;
        setAllOrgs(os);
        setAllBranches(bs);
      })
      .catch(e => console.error('TenantProvider load error:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Visibility: which orgs and branches the signed-in user can see ──
  //
  // • Platform admin    → everything
  // • Org admin         → only their org(s); all branches under those orgs
  // • Branch manager    → only the branches they're staff of; org auto-derived
  // • Anonymous (guest) → everything (dev mode without sign-in)
  //
  // The branch manager case is the strictest: we hide other branches in the
  // sidebar AND restrict scopedRestaurantIds to their managed branches only.
  const orgs = useMemo(() => {
    if (!admin || admin.isPlatformAdmin) return allOrgs;
    if (admin.isOrgAdmin) return allOrgs.filter(o => admin.orgAdminOf.includes(o.id));
    if (admin.isStaff) {
      const myBranchOrgIds = new Set(
        allBranches
          .filter(b => admin.staffRoles.some(s => s.restaurant_id === b.id))
          .map(b => b.organization_id),
      );
      return allOrgs.filter(o => myBranchOrgIds.has(o.id));
    }
    return [];
  }, [admin, allOrgs, allBranches]);

  // Auto-pick a default org if the stored one isn't accessible
  useEffect(() => {
    if (loading) return;
    if (orgs.length === 0) return;
    const stillValid = orgId && orgs.some(o => o.id === orgId);
    if (!stillValid) {
      setStored({ orgId: orgs[0].id, branchId: null });
    }
  }, [loading, orgs, orgId]);

  const org = useMemo(
    () => orgs.find(o => o.id === orgId) ?? null,
    [orgs, orgId],
  );

  // Branches the signed-in user can see WITHIN the picked org
  const branches = useMemo(() => {
    if (!org) return [];
    const orgBranches = allBranches.filter(b => b.organization_id === org.id);
    if (!admin || admin.isPlatformAdmin || admin.isOrgAdmin) return orgBranches;
    if (admin.isStaff) {
      const allowed = new Set(admin.staffRoles.map(s => s.restaurant_id));
      return orgBranches.filter(b => allowed.has(b.id));
    }
    return [];
  }, [org, allBranches, admin]);

  // Auto-pick branch if stored one isn't accessible
  useEffect(() => {
    if (loading || !org) return;
    if (branchId === null) return; // null = "All branches" view, leave it
    const stillValid = branches.some(b => b.id === branchId);
    if (!stillValid) {
      // For branch managers, default to their first allowed branch (not 'all')
      const firstBranch = admin?.isStaff && !admin.isPlatformAdmin && !admin.isOrgAdmin
        ? branches[0]?.id ?? null
        : null;
      setStored(prev => ({ ...prev, branchId: firstBranch }));
    }
  }, [loading, org, branches, branchId, admin]);

  const branch = useMemo(
    () => branches.find(b => b.id === branchId) ?? null,
    [branches, branchId],
  );

  // Branch managers cannot select "All branches" — force their single branch
  const isBranchManagerOnly = !!admin && !admin.isPlatformAdmin && !admin.isOrgAdmin && admin.isStaff;

  const scopedRestaurantIds = useMemo(() => {
    if (branch) return [branch.id];
    if (isBranchManagerOnly) return branches.map(b => b.id);
    return branches.map(b => b.id);
  }, [branch, branches, isBranchManagerOnly]);

  const value: TenantCtx = {
    org, orgs, branch, branches,
    loading: loading || state === 'loading',
    scopedRestaurantIds,
    setOrg: (id) => {
      if (!orgs.some(o => o.id === id)) return; // ignore inaccessible orgs
      const firstBranch = allBranches.find(b => b.organization_id === id);
      setStored({ orgId: id, branchId: firstBranch?.id ?? null });
    },
    setBranch: (id) => {
      // Branch managers can't switch to 'All' — they only have their branch(es)
      if (id === null && isBranchManagerOnly && branches.length === 1) {
        setStored(prev => ({ ...prev, branchId: branches[0].id }));
        return;
      }
      setStored(prev => ({ ...prev, branchId: id }));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTenant must be used inside TenantProvider');
  return v;
}
