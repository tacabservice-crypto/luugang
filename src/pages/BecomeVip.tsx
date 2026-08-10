import React, { useEffect, useState } from 'react';
import { useAuth } from '../firebase-client'; // Assuming useAuth provides user data

interface VipTier {
  name: string;
  price: number;
  durationMonths: number;
  rakeDiscount: number;
  features: string[];
}

const BecomeVip: React.FC = () => {
  const { user } = useAuth(); // Get authenticated user
  const [vipTiers, setVipTiers] = useState<Record<string, VipTier>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // In a real app, you'd fetch VIP tiers from a public API endpoint
    // For now, let's use a mock or hardcoded data as we don't have a public endpoint for tiers
    const mockVipTiers: Record<string, VipTier> = {
      gold: {
        name: 'Gold VIP',
        price: 10,
        durationMonths: 1,
        rakeDiscount: 0.02,
        features: ['Ad-free experience', 'Exclusive avatar borders', '2% Rake Discount', 'Priority Customer Support'],
      },
      platinum: {
        name: 'Platinum VIP',
        price: 25,
        durationMonths: 3,
        rakeDiscount: 0.05,
        features: ['All Gold features', 'Unique animated avatars', '5% Rake Discount', 'Early access to new game modes'],
      },
    };
    setVipTiers(mockVipTiers);
    setLoading(false);
  }, []);

  const handleSubscribe = async (tier: string) => {
    if (!user || !user.idToken) {
      setMessage('Please log in to subscribe to VIP.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      // Assuming a global API_BASE_URL is configured or imported
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/vip/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.idToken}`,
        },
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe to VIP.');
      }

      setMessage(data.message || 'Successfully subscribed to VIP!');
      // Optionally, refresh user data to show new VIP status
    } catch (err: any) {
      console.error('VIP Subscription error:', err);
      setError(err.message || 'An error occurred during subscription.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-white">Loading VIP tiers...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-4 bg-gray-800 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Become a VIP!</h1>
      <p className="mb-8 text-lg">Unlock exclusive benefits and enhance your Ludo$om experience.</p>

      {message && <div className="bg-green-500 p-3 rounded mb-4">{message}</div>}
      {user && user.vip && user.vip.expires > Date.now() && (
        <div className="bg-blue-600 p-4 rounded-lg mb-6 shadow-lg">
          <h2 className="text-xl font-semibold">Current VIP Status:</h2>
          <p className="text-lg">Tier: {user.vip.tier.charAt(0).toUpperCase() + user.vip.tier.slice(1)}</p>
          <p>Expires: {new Date(user.vip.expires).toLocaleDateString()}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {Object.entries(vipTiers).map(([key, tierInfo]) => (
          <div key={key} className="bg-gray-700 p-6 rounded-lg shadow-xl border border-gray-600 hover:border-purple-500 transition-all duration-300">
            <h2 className="text-2xl font-bold mb-4 text-purple-400">{tierInfo.name}</h2>
            <p className="text-4xl font-extrabold mb-4">${tierInfo.price}<span className="text-lg font-normal">/month</span></p>
            <ul className="list-disc list-inside mb-6 text-gray-300">
              {tierInfo.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
            {user && user.vip && user.vip.tier === key && user.vip.expires > Date.now() ? (
              <button
                className="w-full bg-gray-500 text-white font-bold py-3 px-4 rounded-lg cursor-not-allowed"
                disabled
              >
                Currently Subscribed
              </button>
            ) : (
              <button
                onClick={() => handleSubscribe(key)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300"
                disabled={loading}
              >
                {loading ? 'Processing...' : `Subscribe to ${tierInfo.name}`}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BecomeVip;