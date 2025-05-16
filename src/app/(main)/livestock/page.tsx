
import { PageHeader } from '@/components/layout/page-header';
import { LivestockManagementContent } from '@/components/livestock-management-content';
import { Icons } from '@/components/icons';

export default function LivestockPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Livestock Management"
        description="Manage your animal registry, health records, and breeding information."
        icon={Icons.Livestock}
      />
      <LivestockManagementContent />
    </div>
  );
}
