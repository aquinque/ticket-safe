import React, { createContext, useContext, useState, ReactNode } from 'react';
import { EventData } from '@/data/eventsData';

export interface TicketListing {
  id: string;
  event: EventData;
  sellingPrice: number;
  quantity: number;
  description: string;
  files: { name: string; size: number; type: string }[];
  sellerId: string;
  sellerName: string;
  timestamp: string;
  verified: boolean;
  ticketId: string;
  qrHash: string;
}

interface TicketListingsContextType {
  listings: TicketListing[];
  addListing: (listing: TicketListing) => void;
  removeListing: (id: string) => void;
}

const TicketListingsContext = createContext<TicketListingsContextType | undefined>(undefined);

export const TicketListingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [listings, setListings] = useState<TicketListing[]>([]);

  const addListing = (listing: TicketListing) => {
    setListings(prev => [...prev, listing]);
  };

  const removeListing = (id: string) => {
    setListings(prev => prev.filter(listing => listing.id !== id));
  };

  return (
    <TicketListingsContext.Provider value={{ listings, addListing, removeListing }}>
      {children}
    </TicketListingsContext.Provider>
  );
};

export const useTicketListings = () => {
  const context = useContext(TicketListingsContext);
  if (context === undefined) {
    throw new Error('useTicketListings must be used within a TicketListingsProvider');
  }
  return context;
};
