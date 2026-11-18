export interface NotificationItem {
  id: number;
  app_id: string;
  app_name: string;
  app_icon_base64: string | null;
  title: string;
  body: string;
  timestamp: number;
  time_formatted: string;
  is_urgent: boolean;
  is_coalesced: boolean;
  coalesce_count: number;
  coalesced_messages: string[];
}

export interface ListenerStatusPayload {
  status: 'allowed' | 'denied' | 'unsupported' | 'error';
  message: string;
}

export interface ActiveAppStack {
  app_id: string;
  app_name: string;
  items: NotificationItem[];
  isExpanded: boolean;
}
