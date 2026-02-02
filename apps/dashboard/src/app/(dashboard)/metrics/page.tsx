'use client';

import { useState, useEffect } from 'react';
import { MetricsExplorer } from '@/components/metrics/metrics-explorer';
import { MetricsCharts } from '@/components/metrics-dashboard/metrics-charts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  project: {
    id: string;
    name: string;
  };
}

export default function MetricsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await fetch('/api/v1/services');
        const data = await response.json();

        if (data.success && data.data) {
          setServices(data.data);
          if (data.data.length > 0 && !selectedServiceId) {
            setSelectedServiceId(data.data[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching services:', error);
        setServices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, [selectedServiceId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Metrics</h1>
        <p className="text-sm text-muted-foreground">
          Application and infrastructure metrics from your services
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-md">
          <Select
            value={selectedServiceId}
            onValueChange={setSelectedServiceId}
            disabled={loading || services.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name} ({service.project.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!loading && services.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No services found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create a service to start viewing metrics
          </p>
        </Card>
      ) : selectedServiceId ? (
        <>
          <MetricsCharts serviceId={selectedServiceId} />
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Metrics Explorer</h2>
            <MetricsExplorer serviceId={selectedServiceId} />
          </div>
        </>
      ) : null}
    </div>
  );
}
