export type BodyType = 'sedan' | 'suv' | 'truck' | 'van' | 'motorcycle' | 'other';
export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type TransmissionType = 'automatic' | 'manual';
export type VehicleStatus = 'active' | 'maintenance' | 'inactive';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  bodyType: BodyType;
  vin: string;
  plateNumber: string;
  color: string;
  fuelType: FuelType;
  transmission: TransmissionType;
  mileage: number;
  status: VehicleStatus;
  purchaseDate: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  notes: string;
  imageUrl: string;
  createdAt: string;
}

export type UserRole = 'admin' | 'company' | 'driver' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type RootStackParamList = {
  _index: undefined;
  '(auth)': undefined;
  '(tabs)': undefined;
  'vehicle/[id]': { id: string };
  'vehicle/add': undefined;
  'delivery/[id]': { id: string };
};

export type AuthStackParamList = {
  login: undefined;
  register: undefined;
};

export type TabStackParamList = {
  index: undefined;
  dashboard: undefined;
  delivery: undefined;
  profile: undefined;
};
