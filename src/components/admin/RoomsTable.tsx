import React from 'react';
import { XCircle, Eye } from 'lucide-react';

const RoomsTable = ({ rooms, onCancel, onSpectate }) => {
  return (
    <div className="w-full min-w-0 bg-white p-3 sm:p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Game Rooms</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[780px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Room ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Players</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bet</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rooms.map(room => (
              <tr key={room.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{room.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    room.status === 'playing' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {room.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{room.players.length} / {room.capacity}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">${room.betAmount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(room.createdAt).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex items-center justify-end space-x-2">
                  <button onClick={() => onSpectate(room.id)} className="text-blue-500 hover:text-blue-700 flex items-center">
                    <Eye size={18} className="mr-1" />
                    Spectate
                  </button>
                  <button onClick={() => onCancel(room.id)} className="text-red-500 hover:text-red-700 flex items-center">
                    <XCircle size={18} className="mr-1" />
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RoomsTable;
