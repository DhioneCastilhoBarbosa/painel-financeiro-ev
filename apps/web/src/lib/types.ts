export type Permission =
  | "view_dashboard" | "view_stations" | "view_users" | "view_investment"
  | "import_files" | "delete_files" | "manage_alerts" | "manage_settings"
  | "manage_team" | "view_billing" | "view_audit"
  // Leads / simulador público
  | "view_leads" | "manage_leads";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  organization_id: string;
  organization_name: string;
  email_verified: boolean;
  is_master: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  permissions: Record<Permission, boolean>;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<Permission, boolean>;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface DataFile {
  id: string;
  filename: string;
  original_filename: string;
  status: "pending" | "processing" | "done" | "error";
  file_size_bytes: number;
  row_count: number | null;
  date_min: string | null;
  date_max: string | null;
  stations: string[];
  connector_types: string[];
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
}

export interface KPIs {
  total_sessions: number;
  paid_sessions: number;
  revenue: number;
  pending_rev: number;
  energy_kwh: number;
  avg_kwh: number;
  avg_ticket: number;
  rev_per_kwh: number;
  rev_per_day: number;
  kwh_per_day: number;
  sessions_per_day: number;
  days: number;
  conversion: number;
  approval: number;
  rejection_rate: number;
  unique_users: number;
  one_time: number;
  power_users: number;
  power_rev_pct: number;
}

export interface TimeSeriesPoint {
  date: string;
  revenue: number;
  sessions?: number;
  kwh?: number;
}

export interface StationRanking {
  station: string;
  revenue: number;
  sessions: number;
  sessions_per_day: number;
  kwh: number;
}

export interface OccupancyData {
  station: string;
  occupancy_rate: number;
  active_hours: number;
}

export interface PaymentBreakdown {
  funnel: { label: string; value: number }[];
  methods: { method: string; count: number; revenue: number }[];
}

export interface RevenueSources {
  start_fee: number;
  energy: number;
  idle: number;
  total: number;
  weekly: { week: string; start_fee: number; energy: number; idle: number }[];
}

export interface ConnectorData {
  connector_type: string;
  sessions: number;
  revenue: number;
  kwh: number;
  avg_duration: number;
}

export interface WeekdayData {
  day: string;
  sessions: number;
  revenue: number;
}

export interface HourlyData {
  hour: number;
  sessions: number;
  revenue: number;
}

export interface DREPeriod {
  period: string;
  revenue: number;
  energy_cost: number;
  operational_cost: number;
  platform_fee: number;
  tax: number;
  maintenance: number;
  ebitda: number;
  ebitda_margin: number;
  net_income: number;
  net_margin: number;
}

export interface Insight {
  type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "success";
}

export interface PaybackScenario {
  occupancy_pct: number;
  monthly_sessions: number;
  monthly_revenue: number;
  monthly_net: number;
  payback_months: number | null;
  npv: number;
  irr: number | null;
}

export interface FilterParams {
  date_from?: string;
  date_to?: string;
  files?: string[];
  stations?: string[];
  connectors?: string[];
}
