'use client';
import { useState, useEffect } from 'react';

export interface Charger {
  id: number;
  lat: number;
  lng: number;
  title: string;
  address: string;
  connections: number;
  operator: string;
}

const MOCK_CHARGERS: Charger[] = [
  { id: 1, lat: -23.5505, lng: -46.6333, title: 'Eletroposto Paulista', address: 'São Paulo, SP', connections: 4, operator: 'Intelbras' },
  { id: 2, lat: -23.6, lng: -46.7, title: 'Eletroposto Santo André', address: 'Santo André, SP', connections: 2, operator: 'Intelbras' },
  { id: 3, lat: -22.9068, lng: -43.1729, title: 'Eletroposto Barra', address: 'Rio de Janeiro, RJ', connections: 2, operator: 'EDP' },
  { id: 4, lat: -22.95, lng: -43.35, title: 'Eletroposto Recreio', address: 'Rio de Janeiro, RJ', connections: 4, operator: 'EDP' },
  { id: 5, lat: -19.9208, lng: -43.9378, title: 'Eletroposto BH Centro', address: 'Belo Horizonte, MG', connections: 3, operator: 'CEMIG' },
  { id: 6, lat: -30.0346, lng: -51.2177, title: 'Eletroposto POA Moinhos', address: 'Porto Alegre, RS', connections: 2, operator: 'CPFL' },
  { id: 7, lat: -25.4290, lng: -49.2671, title: 'Eletroposto Curitiba', address: 'Curitiba, PR', connections: 6, operator: 'Volvo' },
  { id: 8, lat: -27.5954, lng: -48.5480, title: 'Eletroposto Floripa', address: 'Florianópolis, SC', connections: 4, operator: 'Celesc' },
  { id: 9, lat: -15.7797, lng: -47.9297, title: 'Eletroposto Brasília', address: 'Brasília, DF', connections: 8, operator: 'CEB' },
  { id: 10, lat: -12.9714, lng: -38.5014, title: 'Eletroposto Salvador', address: 'Salvador, BA', connections: 2, operator: 'COELBA' },
];

let chargerCache: Charger[] | null = null;

export function useOpenChargeMap() {
  const [chargers, setChargers] = useState<Charger[]>(chargerCache ?? []);
  const [loading, setLoading] = useState(!chargerCache);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    if (chargerCache) return;

    const apiKey = process.env.NEXT_PUBLIC_OPEN_CHARGE_MAP_KEY;
    if (!apiKey) {
      chargerCache = MOCK_CHARGERS;
      setChargers(MOCK_CHARGERS);
      setUsingMock(true);
      setLoading(false);
      return;
    }

    fetch(
      `https://api.openchargemap.io/v3/poi/?output=json&countrycode=BR&maxresults=5000&key=${apiKey}`
    )
      .then((r) => {
        if (!r.ok) throw new Error('Open Charge Map indisponível');
        return r.json();
      })
      .then(
        (
          data: Array<{
            ID: number;
            AddressInfo: {
              Latitude: number;
              Longitude: number;
              Title: string;
              Town: string;
              StateOrProvince: string;
            };
            NumberOfPoints: number;
            OperatorInfo?: { Title: string };
          }>
        ) => {
          const mapped: Charger[] = data
            .filter((d) => d.AddressInfo?.Latitude && d.AddressInfo?.Longitude)
            .map((d) => ({
              id: d.ID,
              lat: d.AddressInfo.Latitude,
              lng: d.AddressInfo.Longitude,
              title: d.AddressInfo.Title,
              address: [d.AddressInfo.Town, d.AddressInfo.StateOrProvince]
                .filter(Boolean)
                .join(', '),
              connections: d.NumberOfPoints || 1,
              operator: d.OperatorInfo?.Title || 'Desconhecido',
            }));
          chargerCache = mapped;
          setChargers(mapped);
          setLoading(false);
        }
      )
      .catch((err: Error) => {
        setError(err.message);
        chargerCache = MOCK_CHARGERS;
        setChargers(MOCK_CHARGERS);
        setUsingMock(true);
        setLoading(false);
      });
  }, []);

  return { chargers, loading, error, usingMock };
}
