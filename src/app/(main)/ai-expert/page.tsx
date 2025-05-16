import { PageHeader } from '@/components/layout/page-header';
import { AiExpertContent } from '@/components/ai-expert-content';
import { Icons } from '@/components/icons';

export default function AiExpertPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Farm Expert"
        description="Leverage AI to get answers, treatment plans, and optimization strategies for your farm."
        icon={Icons.AIExpert}
      />
      <AiExpertContent />
    </div>
  );
}
