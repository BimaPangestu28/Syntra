'use client';

import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  status: string;
}

interface ServiceRefHelperProps {
  projectId: string;
  onInsert: (ref: string) => void;
}

const PROPERTY_OPTIONS = [
  { value: '', label: 'Hostname', description: 'service-name.internal' },
  { value: 'port', label: 'Port', description: 'Service port number' },
  { value: 'url', label: 'URL', description: 'http://hostname:port' },
  { value: 'hostname', label: 'Hostname (explicit)', description: 'Same as default' },
];

export function ServiceRefHelper({ projectId, onInsert }: ServiceRefHelperProps) {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  useEffect(() => {
    if (open && services.length === 0) {
      fetchServices();
    }
  }, [open]);

  async function fetchServices() {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/services?project_id=${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch services');
      }
      const data = await response.json();
      if (data.success) {
        setServices(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleServiceSelect(serviceName: string) {
    setSelectedService(serviceName);
  }

  function handlePropertySelect(property: string) {
    if (!selectedService) return;

    const refString = property
      ? `\${{ref:${selectedService}:${property}}}`
      : `\${{ref:${selectedService}}}`;

    onInsert(refString);
    setOpen(false);
    setSelectedService(null);
  }

  function handleBack() {
    setSelectedService(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Link2 className="h-4 w-4 mr-2" />
          Link Service
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        {!selectedService ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Select a service</h4>
              <p className="text-xs text-muted-foreground">
                Reference another service in this project
              </p>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Loading services...
                </p>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No services found in this project
                </p>
              ) : (
                services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => handleServiceSelect(service.name)}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors flex items-center justify-between"
                    type="button"
                  >
                    <span className="font-medium">{service.name}</span>
                    <Badge
                      variant={service.status === 'running' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {service.status}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Select property</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  type="button"
                  className="h-auto p-1 text-xs"
                >
                  Back
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Service: <span className="font-mono">{selectedService}</span>
              </p>
            </div>
            <div className="space-y-1">
              {PROPERTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handlePropertySelect(option.value)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                  type="button"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {option.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
