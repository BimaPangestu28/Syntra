'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AIChatPanel } from './ai-chat-panel';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Service {
  id: string;
  name: string;
}

interface AIChatTriggerProps {
  services?: Service[];
  initialServiceId?: string;
  className?: string;
}

export function AIChatTrigger({
  services,
  initialServiceId,
  className,
}: AIChatTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [serviceList, setServiceList] = useState<Service[]>(services || []);

  // Fetch services if not provided
  useEffect(() => {
    if (!services) {
      fetch('/api/v1/services')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setServiceList(
              data.data.map((s: { id: string; name: string }) => ({
                id: s.id,
                name: s.name,
              }))
            );
          }
        })
        .catch(() => {
          // Silently fail - services are optional
        });
    }
  }, [services]);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40',
          'bg-white text-black hover:bg-white/90',
          className
        )}
        size="icon"
      >
        <Sparkles className="w-6 h-6" />
        <span className="sr-only">Open AI Assistant</span>
      </Button>

      <AIChatPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        services={serviceList}
        initialServiceId={initialServiceId}
      />
    </>
  );
}
