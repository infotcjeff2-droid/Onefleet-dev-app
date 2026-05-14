import { Vehicle } from '@/types';

export const mockVehicles: Vehicle[] = [
  {
    id: 'v001',
    make: 'Toyota',
    model: 'Camry',
    year: 2023,
    bodyType: 'sedan',
    vin: '1HGBH41JXMN109186',
    plateNumber: 'ABC-1234',
    color: 'Pearl White',
    fuelType: 'hybrid',
    transmission: 'automatic',
    mileage: 15230,
    status: 'active',
    purchaseDate: '2023-03-15',
    insuranceExpiry: '2026-03-15',
    registrationExpiry: '2026-12-31',
    notes: 'Company executive vehicle. Low mileage, excellent condition.',
    imageUrl: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&q=80',
    createdAt: '2023-03-15T10:00:00Z',
  },
  {
    id: 'v002',
    make: 'Ford',
    model: 'Transit',
    year: 2022,
    bodyType: 'van',
    vin: '1FTBR1XM5KKA12345',
    plateNumber: 'XYZ-5678',
    color: 'Silver',
    fuelType: 'diesel',
    transmission: 'automatic',
    mileage: 48750,
    status: 'active',
    purchaseDate: '2022-07-20',
    insuranceExpiry: '2025-07-20',
    registrationExpiry: '2025-06-30',
    notes: 'Cargo van for deliveries. Regular maintenance up to date.',
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    createdAt: '2022-07-20T09:30:00Z',
  },
  {
    id: 'v003',
    make: 'Tesla',
    model: 'Model 3',
    year: 2024,
    bodyType: 'sedan',
    vin: '5YJ3E1EA7KF123456',
    plateNumber: 'EV-0001',
    color: 'Midnight Silver',
    fuelType: 'electric',
    transmission: 'automatic',
    mileage: 8250,
    status: 'active',
    purchaseDate: '2024-01-10',
    insuranceExpiry: '2027-01-10',
    registrationExpiry: '2026-01-10',
    notes: 'Electric fleet vehicle. Free supercharging available.',
    imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800&q=80',
    createdAt: '2024-01-10T14:00:00Z',
  },
  {
    id: 'v004',
    make: 'Chevrolet',
    model: 'Silverado',
    year: 2021,
    bodyType: 'truck',
    vin: '3GCPYBEK3MG123456',
    plateNumber: 'TRK-9012',
    color: 'Steel Gray',
    fuelType: 'gasoline',
    transmission: 'automatic',
    mileage: 67800,
    status: 'maintenance',
    purchaseDate: '2021-05-22',
    insuranceExpiry: '2025-05-22',
    registrationExpiry: '2025-05-31',
    notes: 'Pickup truck for site visits. Currently in maintenance for brake replacement.',
    imageUrl: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80',
    createdAt: '2021-05-22T08:00:00Z',
  },
  {
    id: 'v005',
    make: 'Honda',
    model: 'CR-V',
    year: 2023,
    bodyType: 'suv',
    vin: '2HKRW2H57KH123456',
    plateNumber: 'SUV-3456',
    color: 'Obsidian Blue',
    fuelType: 'hybrid',
    transmission: 'automatic',
    mileage: 22100,
    status: 'active',
    purchaseDate: '2023-09-01',
    insuranceExpiry: '2026-09-01',
    registrationExpiry: '2026-08-31',
    notes: 'SUV for client transportation. Spacious interior.',
    imageUrl: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
    createdAt: '2023-09-01T11:00:00Z',
  },
  {
    id: 'v006',
    make: 'Isuzu',
    model: 'N-Series',
    year: 2020,
    bodyType: 'truck',
    vin: 'JAANPR75LG7100001',
    plateNumber: 'LGE-7788',
    color: 'White',
    fuelType: 'diesel',
    transmission: 'manual',
    mileage: 125000,
    status: 'inactive',
    purchaseDate: '2020-02-14',
    insuranceExpiry: '2024-02-14',
    registrationExpiry: '2024-12-31',
    notes: 'Light truck. Retired from active fleet. Pending disposal.',
    imageUrl: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&q=80',
    createdAt: '2020-02-14T07:30:00Z',
  },
];

export const adminCredentials = {
  email: 'admin@fleetpro.com',
  password: 'admin123',
};

export const demoCredentials = {
  email: 'demo@fleetpro.com',
  password: 'demo123',
};

export const driverCredentials = {
  email: 'driver',
  password: 'driver',
};

export const companyCredentials = {
  email: 'company',
  password: 'company',
};

export const bodyTypeLabels: Record<string, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  truck: 'Truck',
  van: 'Van',
  motorcycle: 'Motorcycle',
  other: 'Other',
};

export const fuelTypeLabels: Record<string, string> = {
  gasoline: 'Gasoline',
  diesel: 'Diesel',
  electric: 'Electric',
  hybrid: 'Hybrid',
};

export const transmissionLabels: Record<string, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
};

export type DeliveryStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'signed';

export interface DeliveryOrder {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  pickupTime: string;
  dropoffAddress: string;
  dropoffTime?: string;
  cargoDescription: string;
  cargoWeight: number;
  notes?: string;
  status: DeliveryStatus;
  assignedDriverId?: string;
  assignedDriverName?: string;
  signatureData?: string;
  signedAt?: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
}

export const mockDrivers: Driver[] = [
  { id: 'd001', name: 'John Smith', phone: '+1234567890', vehiclePlate: 'ABC-1234', status: 'available' },
  { id: 'd002', name: 'Mike Johnson', phone: '+1234567891', vehiclePlate: 'XYZ-5678', status: 'busy' },
  { id: 'd003', name: 'David Lee', phone: '+1234567892', vehiclePlate: 'DEF-9012', status: 'available' },
];

export const mockDeliveries: DeliveryOrder[] = [
  {
    id: 'del001',
    orderNo: 'WO-2026-001',
    customerName: 'Acme Corp',
    customerPhone: '+1234567890',
    pickupAddress: '123 Factory Rd, Industrial Zone',
    pickupTime: '2026-05-13 09:00',
    dropoffAddress: '456 Customer Ave, Downtown',
    cargoDescription: 'Electronic Components x 20 boxes',
    cargoWeight: 150,
    notes: 'Handle with care',
    status: 'pending',
    createdAt: '2026-05-13T08:00:00Z',
  },
  {
    id: 'del002',
    orderNo: 'WO-2026-002',
    customerName: 'Global Trading',
    customerPhone: '+1234567891',
    pickupAddress: '789 Warehouse Blvd, Port Area',
    pickupTime: '2026-05-13 11:00',
    dropoffAddress: '321 Office Tower, Business Park',
    cargoDescription: 'Office Furniture - Desks & Chairs',
    cargoWeight: 300,
    status: 'assigned',
    assignedDriverId: 'd001',
    assignedDriverName: 'John Smith',
    createdAt: '2026-05-13T09:00:00Z',
  },
  {
    id: 'del003',
    orderNo: 'WO-2026-003',
    customerName: 'Tech Solutions',
    customerPhone: '+1234567892',
    pickupAddress: '555 Tech Park, Innovation District',
    pickupTime: '2026-05-13 14:00',
    dropoffAddress: '888 Startup Hub, Downtown',
    cargoDescription: 'Server Equipment - 5 units',
    cargoWeight: 200,
    notes: 'Fragile - IT equipment',
    status: 'in_transit',
    assignedDriverId: 'd002',
    assignedDriverName: 'Mike Johnson',
    createdAt: '2026-05-13T10:00:00Z',
  },
  {
    id: 'del004',
    orderNo: 'WO-2026-004',
    customerName: 'Fresh Market',
    customerPhone: '+1234567893',
    pickupAddress: '100 Farm Road, Rural Area',
    pickupTime: '2026-05-13 06:00',
    dropoffAddress: '200 Supermarket, City Center',
    cargoDescription: 'Fresh Produce - Mixed crates',
    cargoWeight: 500,
    status: 'signed',
    assignedDriverId: 'd001',
    assignedDriverName: 'John Smith',
    signatureData: 'signed',
    signedAt: '2026-05-13T08:30:00Z',
    createdAt: '2026-05-13T05:00:00Z',
  },
  {
    id: 'del005',
    orderNo: 'WO-2026-005',
    customerName: 'Auto Parts Inc',
    customerPhone: '+1234567894',
    pickupAddress: '777 Industrial Ave, Manufacturing Zone',
    pickupTime: '2026-05-13 16:00',
    dropoffAddress: '999 Auto Shop, Suburb',
    cargoDescription: 'Car Parts - Engine components',
    cargoWeight: 450,
    status: 'pending',
    createdAt: '2026-05-13T12:00:00Z',
  },
  {
    id: 'del006',
    orderNo: 'WO-2025-101',
    customerName: 'Pacific Traders',
    customerPhone: '+1234567895',
    pickupAddress: '55 Harbor Rd, Coastal District',
    pickupTime: '2025-11-20 08:00',
    dropoffAddress: '88 Import St, Commercial Zone',
    cargoDescription: 'Marine Equipment - 10 crates',
    cargoWeight: 600,
    notes: 'Keep dry',
    status: 'signed',
    assignedDriverId: 'd003',
    assignedDriverName: 'David Lee',
    signatureData: 'signed',
    signedAt: '2025-11-20T11:00:00Z',
    createdAt: '2025-11-19T16:00:00Z',
  },
  {
    id: 'del007',
    orderNo: 'WO-2025-102',
    customerName: 'City Logistics',
    customerPhone: '+1234567896',
    pickupAddress: '12 Metro Blvd, Central District',
    pickupTime: '2025-11-18 10:00',
    dropoffAddress: '34 Station Rd, North Area',
    cargoDescription: 'Office Supplies - Bulk order',
    cargoWeight: 250,
    status: 'signed',
    assignedDriverId: 'd001',
    assignedDriverName: 'John Smith',
    signatureData: 'signed',
    signedAt: '2025-11-18T13:00:00Z',
    createdAt: '2025-11-17T14:00:00Z',
  },
];

export const statusLabels: Record<string, string> = {
  active: 'Active',
  maintenance: 'Maintenance',
  inactive: 'Inactive',
};
