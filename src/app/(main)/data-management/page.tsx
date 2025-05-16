import { PageHeader } from '@/components/layout/page-header';
import { DataManagementContent } from '@/components/data-management-content';
import { Icons } from '@/components/icons';

export default function DataManagementPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Management"
        description="Manage your farm's planting, harvesting, soil, and weather records."
        icon={Icons.DataManagement}
      />
      <DataManagementContent />
    </div>
  );
}
