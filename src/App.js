import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';

// Context for Firebase and User
const FirebaseContext = createContext(null);

// IMPORTANT: REPLACE THESE WITH YOUR ACTUAL FIREBASE CONFIGURATION
// Get this from your Firebase project settings (Project settings -> General -> Your apps -> Firebase SDK snippet -> Config)
const firebaseConfig = {
  apiKey: "AIzaSyCUK6qSrSoH2IaEX0Wot6SFTNaor5JPU1k",
  authDomain: "my-travel-app-final-327bc.firebaseapp.com",
  projectId: "my-travel-app-final-327bc",
  storageBucket: "my-travel-app-final-327bc.firebasestorage.app",
  messagingSenderId: "689797792098",
  appId: "1:689797792098:web:5a591130050a74fedf6c3b",
  measurementId: "G-0SV0DZZNVN"
};

// IMPORTANT: REPLACE THIS WITH YOUR ACTUAL FIREBASE PROJECT ID
// This is the Project ID from your Firebase Console (e.g., "my-travel-app-final-xxxx")
const APP_ID_FOR_DEPLOYMENT = "my-travel-app-final-327bc";


// Firebase Configuration and Initialization
const FirebaseProvider = ({ children }) => {
    const [app, setApp] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        try {
            const initializedApp = initializeApp(firebaseConfig);
            setApp(initializedApp);

            const firestoreDb = getFirestore(initializedApp);
            setDb(firestoreDb);
            const firebaseAuth = getAuth(initializedApp);
            setAuth(firebaseAuth);

            const signIn = async () => {
                try {
                    await signInAnonymously(firebaseAuth);
                } catch (e) {
                    console.error("Firebase authentication error:", e);
                    setError("Failed to authenticate with Firebase.");
                } finally {
                    onAuthStateChanged(firebaseAuth, (user) => {
                        if (user) {
                            setUserId(user.uid);
                        } else {
                            setUserId(crypto.randomUUID()); // Fallback to random UUID if no user
                        }
                        setIsAuthReady(true);
                        setLoading(false);
                    });
                }
            };
            signIn();

        } catch (e) {
            console.error("Firebase initialization error:", e);
            setError("Failed to initialize Firebase.");
            setLoading(false);
        }
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Loading Firebase...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700">
                <div className="text-xl font-semibold">Error: {error}</div>
            </div>
        );
    }

    return (
        <FirebaseContext.Provider value={{ app, db, auth, userId, isAuthReady }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// Custom hook to use Firebase context
const useFirebase = () => {
    const context = useContext(FirebaseContext);
    if (!context) {
        throw new Error('useFirebase must be used within a FirebaseProvider');
    }
    return context;
};

// Main App Component
const App = () => {
    const { db, userId, isAuthReady } = useFirebase();
    const [itinerary, setItinerary] = useState([]);
    const [activeForm, setActiveForm] = useState(null); // 'flight', 'car', 'event', null
    const [message, setMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [sharedItineraryId, setSharedItineraryId] = useState('');
    const [viewingShared, setViewingShared] = useState(false);
    const [currentSharedId, setCurrentSharedId] = useState(''); // Stores the ID of the shared itinerary being viewed

    const appId = APP_ID_FOR_DEPLOYMENT;

    // Function to fetch itinerary items from Firestore
    useEffect(() => {
        let unsubscribe;
        if (db && userId && isAuthReady) {
            const collectionPath = viewingShared
                ? `artifacts/${appId}/public/data/sharedItineraries`
                : `artifacts/${appId}/users/${userId}/itineraryItems`;

            if (viewingShared && !currentSharedId) {
                setItinerary([]);
                return;
            }

            const docRef = viewingShared
                ? doc(db, collectionPath, currentSharedId)
                : collection(db, collectionPath);

            if (viewingShared) {
                unsubscribe = onSnapshot(docRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const sharedData = docSnap.data().itineraryItems || [];
                        sharedData.sort((a, b) => {
                            const dateA = a.departureDate || a.pickupDate || a.startDate;
                            const dateB = b.departureDate || b.pickupDate || b.startDate;
                            return new Date(dateA) - new Date(dateB);
                        });
                        setItinerary(sharedData);
                        setMessage(`Viewing shared itinerary: ${currentSharedId}`);
                    } else {
                        setItinerary([]);
                        setMessage("Shared itinerary not found or invalid ID.");
                    }
                }, (error) => {
                    console.error("Error fetching shared itinerary:", error);
                    setMessage("Error loading shared itinerary. Please try again.");
                });
            } else {
                unsubscribe = onSnapshot(docRef, (snapshot) => {
                    const items = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    items.sort((a, b) => {
                        const dateA = a.departureDate || a.pickupDate || a.startDate;
                        const dateB = b.departureDate || b.pickupDate || b.startDate;
                        return new Date(dateA) - new Date(dateB);
                    });
                    setItinerary(items);
                    setMessage(''); // Clear message when viewing personal
                }, (error) => {
                    console.error("Error fetching personal itinerary items:", error);
                    setMessage("Error loading your itinerary. Please try again.");
                });
            }
        }
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [db, userId, isAuthReady, appId, viewingShared, currentSharedId]);

    // Function to add/update an item in Firestore
    const handleAddItem = async (item) => {
        if (!db || !userId || viewingShared) {
            setMessage("Cannot add/update items in shared view or database not ready.");
            return;
        }
        try {
            const itineraryCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/itineraryItems`);
            if (item.id) {
                // Update existing item
                const itemRef = doc(db, `artifacts/${appId}/users/${userId}/itineraryItems`, item.id);
                await updateDoc(itemRef, item);
                setMessage('Item updated successfully!');
            } else {
                // Add new item
                await addDoc(itineraryCollectionRef, item);
                setMessage('Item added successfully!');
            }
            setActiveForm(null); // Close form after submission
            setTimeout(() => setMessage(''), 3000); // Clear message after 3 seconds
        } catch (e) {
            console.error("Error adding/updating document: ", e);
            setMessage(`Error adding/updating item: ${e.message}`);
        }
    };

    // Function to initiate delete confirmation
    const confirmDeleteItem = (item) => {
        if (viewingShared) {
            setMessage("Cannot delete items in shared view.");
            return;
        }
        setItemToDelete(item);
        setShowDeleteConfirm(true);
    };

    // Function to delete an item from Firestore
    const handleDeleteItem = async () => {
        if (!db || !userId || !itemToDelete || viewingShared) {
            setMessage("Cannot delete: Database not ready, no item selected, or in shared view.");
            return;
        }
        try {
            const itemRef = doc(db, `artifacts/${appId}/users/${userId}/itineraryItems`, itemToDelete.id);
            await deleteDoc(itemRef);
            setMessage('Item deleted successfully!');
            setShowDeleteConfirm(false);
            setItemToDelete(null);
            setTimeout(() => setMessage(''), 3000);
        } catch (e) {
            console.error("Error deleting document: ", e);
            setMessage(`Error deleting item: ${e.message}`);
        }
    };

    // Function to publish current itinerary
    const handlePublishItinerary = async () => {
        if (!db || !userId) {
            setMessage("Database not ready. Cannot publish.");
            return;
        }
        if (itinerary.length === 0) {
            setMessage("Your itinerary is empty. Add items before publishing.");
            return;
        }
        try {
            const sharedCollectionRef = collection(db, `artifacts/${appId}/public/data/sharedItineraries`);
            const newSharedDocRef = await addDoc(sharedCollectionRef, {
                itineraryItems: itinerary, // Store a snapshot of current items
                originalUserId: userId,
                publishedAt: new Date().toISOString()
            });
            setMessage(`Itinerary published! Share this ID: ${newSharedDocRef.id}`);
            // Automatically switch to viewing the newly shared itinerary
            setSharedItineraryId(newSharedDocRef.id);
            setCurrentSharedId(newSharedDocRef.id);
            setViewingShared(true);
        } catch (e) {
            console.error("Error publishing itinerary:", e);
            setMessage(`Error publishing itinerary: ${e.message}`);
        }
    };

    // Function to view a shared itinerary
    const handleViewSharedItinerary = () => {
        if (sharedItineraryId.trim()) {
            setCurrentSharedId(sharedItineraryId.trim());
            setViewingShared(true);
        } else {
            setMessage("Please enter a valid Shared Itinerary ID.");
        }
    };

    // Function to switch back to personal itinerary
    const handleViewMyItinerary = () => {
        setViewingShared(false);
        setCurrentSharedId('');
        setSharedItineraryId(''); // Clear the input field
        setMessage('Viewing your personal itinerary.');
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-stone-100 to-blue-100 font-lato text-slate-800 p-4 sm:p-6 lg:p-8 flex flex-col items-center">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');
                body { font-family: 'Lato', sans-serif; }
                .card-shadow {
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                }
                `}
            </style>

            <div className="w-full max-w-4xl bg-white rounded-xl card-shadow p-6 sm:p-8 lg:p-10 mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-center text-slate-800 mb-4">
                    My Travel Wallet ✈️
                </h1>
                <p className="text-center text-slate-700 mb-6">
                    Organize your flights, car rentals, and events in one place.
                </p>
                <div className="text-center text-sm text-slate-600 mb-4 p-2 bg-stone-50 rounded-lg">
                    Your User ID: <span className="font-mono break-all text-slate-800">{userId}</span>
                </div>

                {message && (
                    <div className="bg-blue-100 text-blue-700 p-3 rounded-lg mb-4 text-center">
                        {message}
                    </div>
                )}

                {viewingShared ? (
                    <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-800 p-4 rounded-lg mb-6">
                        <p className="font-semibold">You are currently viewing a shared itinerary.</p>
                        <p className="text-sm">To add or modify your own plans, switch back to "My Itinerary".</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap justify-center gap-4 mb-8">
                        <button
                            onClick={() => setActiveForm('flight')}
                            className="flex items-center justify-center px-6 py-3 bg-blue-800 text-white font-semibold rounded-full shadow-lg hover:bg-blue-900 transition duration-300 ease-in-out transform hover:-translate-y-1"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                            Add Flight
                        </button>
                        <button
                            onClick={() => setActiveForm('car')}
                            className="flex items-center justify-center px-6 py-3 bg-teal-800 text-white font-semibold rounded-full shadow-lg hover:bg-teal-900 transition duration-300 ease-in-out transform hover:-translate-y-1"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10v6m0 0v2a2 2 0 002 2h14a2 2 0 002-2v-2m-2-6V6a2 2 0 00-2-2H5a2 2 0 00-2 2v4m0 0h18"></path></svg>
                            Add Car Rental
                        </button>
                        <button
                            onClick={() => setActiveForm('event')}
                            className="flex items-center justify-center px-6 py-3 bg-emerald-800 text-white font-semibold rounded-full shadow-lg hover:bg-emerald-900 transition duration-300 ease-in-out transform hover:-translate-y-1"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            Add Event
                        </button>
                    </div>
                )}


                {activeForm === 'flight' && <FlightForm onSubmit={handleAddItem} onCancel={() => setActiveForm(null)} />}
                {activeForm === 'car' && <CarRentalForm onSubmit={handleAddItem} onCancel={() => setActiveForm(null)} />}
                {activeForm === 'event' && <EventForm onSubmit={handleAddItem} onCancel={() => setActiveForm(null)} />}

                {/* Sharing Section */}
                <div className="bg-stone-50 p-6 rounded-lg mb-6 card-shadow">
                    <h2 className="text-2xl font-semibold text-slate-800 mb-4">Share & View Itineraries</h2>
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <button
                            onClick={handlePublishItinerary}
                            className="flex-grow px-6 py-3 bg-slate-800 text-white font-semibold rounded-full shadow-lg hover:bg-slate-900 transition duration-300 ease-in-out transform hover:-translate-y-1"
                            disabled={viewingShared}
                        >
                            <svg className="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.882 12.682 9 12 9 12s.118-.682.316-1.342m0 2.684a3 3 0 100-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"></path></svg>
                            Publish My Current Itinerary
                        </button>
                        <button
                            onClick={handleViewMyItinerary}
                            className="flex-grow px-6 py-3 bg-slate-700 text-white font-semibold rounded-full shadow-lg hover:bg-slate-800 transition duration-300 ease-in-out transform hover:-translate-y-1"
                            disabled={!viewingShared}
                        >
                            <svg className="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                            View My Itinerary
                        </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="Enter Shared Itinerary ID"
                            value={sharedItineraryId}
                            onChange={(e) => setSharedItineraryId(e.target.value)}
                            className="flex-grow p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                        <button
                            onClick={handleViewSharedItinerary}
                            className="px-6 py-3 bg-slate-900 text-white font-semibold rounded-full shadow-lg hover:bg-black transition duration-300 ease-in-out transform hover:-translate-y-1"
                        >
                            <svg className="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            View Shared
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-4xl">
                {itinerary.length === 0 ? (
                    <div className="bg-white rounded-xl p-6 text-center text-slate-600 text-lg">
                        {viewingShared ? "No shared itinerary found for this ID." : "Your travel wallet is empty! Add your first item above."}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {itinerary.map(item => {
                            if (item.type === 'flight') {
                                return <FlightCard key={item.id} flight={item} onDelete={confirmDeleteItem} viewingShared={viewingShared} />;
                            } else if (item.type === 'car') {
                                return <CarRentalCard key={item.id} carRental={item} onDelete={confirmDeleteItem} viewingShared={viewingShared} />;
                            } else if (item.type === 'event') {
                                return <EventCard key={item.id} event={item} onDelete={confirmDeleteItem} viewingShared={viewingShared} />;
                            }
                            return null;
                        })}
                    </div>
                )}
            </div>

            {showDeleteConfirm && (
                <DeleteConfirmation
                    onConfirm={handleDeleteItem}
                    onCancel={() => { setShowDeleteConfirm(false); setItemToDelete(null); }}
                />
            )}
        </div>
    );
};

// Helper function to format date and time for Google Calendar URL
const formatDateTimeForGoogleCalendar = (date, time) => {
    if (!date) return '';
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Ensure date is يَسْقُطُ-MM-DD and time is HH:MM
    const dateTimeString = `${date}T${time || '00:00'}:00`;
    // Construct ISO string for the local time, then extract parts for Google Calendar
    const localDate = new Date(dateTimeString);

    // Google Calendar expects يَسْقُطُMMDDTHHMMSS (for local time) or يَسْقُطُMMDDTHHMMSSZ (for UTC)
    // To be safe and explicit, let's format it as local time with the timezone parameter.
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hours = String(localDate.getHours()).padStart(2, '0');
    const minutes = String(localDate.getMinutes()).padStart(2, '0');
    const seconds = String(localDate.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
};

// Form Components
const FlightForm = ({ onSubmit, onCancel }) => {
    const [airline, setAirline] = useState('');
    const [flightNumber, setFlightNumber] = useState('');
    const [departureAirport, setDepartureAirport] = useState('');
    const [arrivalAirport, setArrivalAirport] = useState('');
    const [departureDate, setDepartureDate] = useState('');
    const [departureTime, setDepartureTime] = useState('');
    const [arrivalTime, setArrivalTime] = useState('');
    const [website, setWebsite] = useState(''); // New state for website link
    const [notes, setNotes] = useState(''); // New state for notes

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            type: 'flight',
            airline,
            flightNumber,
            departureAirport,
            arrivalAirport,
            departureDate,
            departureTime,
            arrivalTime,
            website, // Include website in submission
            notes, // Include notes in submission
            timestamp: new Date().toISOString() // For internal ordering if needed
        });
    };

    return (
        <div className="bg-stone-50 p-6 rounded-lg mb-6 card-shadow">
            <h2 className="text-2xl font-semibold text-blue-800 mb-4">Add Flight Details</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                    type="text"
                    placeholder="Airline (e.g., Delta)"
                    value={airline}
                    onChange={(e) => setAirline(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Flight Number (e.g., DL123)"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Departure Airport (e.g., LAX)"
                    value={departureAirport}
                    onChange={(e) => setDepartureAirport(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Arrival Airport (e.g., JFK)"
                    value={arrivalAirport}
                    onChange={(e) => setArrivalAirport(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="date"
                    placeholder="Departure Date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="time"
                    placeholder="Departure Time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="time"
                    placeholder="Arrival Time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                />
                <input
                    type="url" // Use type="url" for better input validation
                    placeholder="Website Link (e.g., https://delta.com)"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 col-span-1 sm:col-span-2"
                />
                <textarea
                    placeholder="Notes (e.g., Gate, Terminal, Baggage Claim)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="col-span-1 sm:col-span-2 p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[80px]"
                ></textarea>
                <div className="col-span-1 sm:col-span-2 flex justify-end gap-3 mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 bg-gray-300 text-gray-800 font-semibold rounded-full hover:bg-gray-400 transition duration-300"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-full hover:bg-blue-900 transition duration-300"
                    >
                        Add Flight
                    </button>
                </div>
            </form>
        </div>
    );
};

const CarRentalForm = ({ onSubmit, onCancel }) => {
    const [company, setCompany] = useState('');
    const [confirmationNumber, setConfirmationNumber] = useState('');
    const [pickupLocation, setPickupLocation] = useState('');
    const [returnLocation, setReturnLocation] = useState('');
    const [pickupDate, setPickupDate] = useState('');
    const [pickupTime, setPickupTime] = useState('');
    const [returnDate, setReturnDate] = useState('');
    const [returnTime, setReturnTime] = useState('');
    const [website, setWebsite] = useState(''); // New state for website link
    const [notes, setNotes] = useState(''); // New state for notes

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            type: 'car',
            company,
            confirmationNumber,
            pickupLocation,
            returnLocation,
            pickupDate,
            pickupTime,
            returnDate,
            returnTime,
            website, // Include website in submission
            notes, // Include notes in submission
            timestamp: new Date().toISOString()
        });
    };

    return (
        <div className="bg-stone-50 p-6 rounded-lg mb-6 card-shadow">
            <h2 className="text-2xl font-semibold text-teal-800 mb-4">Add Car Rental Details</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                    type="text"
                    placeholder="Rental Company (e.g., Hertz)"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Confirmation Number"
                    value={confirmationNumber}
                    onChange={(e) => setConfirmationNumber(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Pickup Location"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Return Location"
                    value={returnLocation}
                    onChange={(e) => setReturnLocation(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="date"
                    placeholder="Pickup Date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="time"
                    placeholder="Pickup Time"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="date"
                    placeholder="Return Date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="time"
                    placeholder="Return Time"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    required
                />
                <input
                    type="url" // Use type="url"
                    placeholder="Website Link (e.g., https://hertz.com)"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 col-span-1 sm:col-span-2"
                />
                <textarea
                    placeholder="Notes (e.g., Car Type, Parking Info)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="col-span-1 sm:col-span-2 p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 min-h-[80px]"
                ></textarea>
                <div className="col-span-1 sm:col-span-2 flex justify-end gap-3 mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 bg-gray-300 text-gray-800 font-semibold rounded-full hover:bg-gray-400 transition duration-300"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-3 bg-teal-800 text-white font-semibold rounded-full hover:bg-teal-900 transition duration-300"
                    >
                        Add Car Rental
                    </button>
                </div>
            </form>
        </div>
    );
};

const EventForm = ({ onSubmit, onCancel }) => {
    const [title, setTitle] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState('');
    const [website, setWebsite] = useState(''); // New state for website link

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            type: 'event',
            title,
            location,
            startDate,
            startTime,
            endDate,
            endTime,
            notes,
            website, // Include website in submission
            timestamp: new Date().toISOString()
        });
    };

    return (
        <div className="bg-stone-50 p-6 rounded-lg mb-6 card-shadow">
            <h2 className="text-2xl font-semibold text-emerald-800 mb-4">Add Calendar Event</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                    type="text"
                    placeholder="Event Title (e.g., Dinner Reservation)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                />
                <input
                    type="text"
                    placeholder="Location (e.g., The Grand Restaurant)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <input
                    type="date"
                    placeholder="Start Date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                />
                <input
                    type="time"
                    placeholder="Start Time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                />
                <input
                    type="date"
                    placeholder="End Date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <input
                    type="time"
                    placeholder="End Time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    required
                />
                <textarea
                    placeholder="Notes (e.g., Confirmation #, special requests)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="col-span-1 sm:col-span-2 p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 min-h-[80px]"
                ></textarea>
                <input
                    type="url" // Use type="url"
                    placeholder="Website Link (e.g., https://eventbrite.com)"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 col-span-1 sm:col-span-2"
                />
                <div className="col-span-1 sm:col-span-2 flex justify-end gap-3 mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 bg-gray-300 text-gray-800 font-semibold rounded-full hover:bg-gray-400 transition duration-300"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-3 bg-emerald-800 text-white font-semibold rounded-full hover:bg-emerald-900 transition duration-300"
                    >
                        Add Event
                    </button>
                </div>
            </form>
        </div>
    );
};

// Display Card Components
const FlightCard = ({ flight, onDelete, viewingShared }) => {
    const handleAddToCalendar = () => {
        const startDateFormatted = formatDateTimeForGoogleCalendar(flight.departureDate, flight.departureTime);
        const endDateFormatted = formatDateTimeForGoogleCalendar(flight.departureDate, flight.arrivalTime); // Assuming arrival on same day
        const title = encodeURIComponent(`${flight.airline} Flight ${flight.flightNumber}`);
        const details = encodeURIComponent(
            `From: ${flight.departureAirport}\nTo: ${flight.arrivalAirport}\nNotes: ${flight.notes || 'N/A'}\n\nConfirmation: (Add manually if needed)`
        );
        const location = encodeURIComponent(`${flight.departureAirport} to ${flight.arrivalAirport}`);
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateFormatted}/${endDateFormatted}&details=${details}&location=${location}&ctz=${encodeURIComponent(timeZone)}`;
        window.open(googleCalendarUrl, '_blank');
    };

    return (
        <div className="bg-white rounded-xl p-6 card-shadow border-l-8 border-blue-800 flex flex-col justify-between">
            <div>
                <div className="flex items-center mb-3">
                    <svg className="w-7 h-7 text-blue-800 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    <h3 className="text-xl font-bold text-blue-900">Flight: {flight.airline} {flight.flightNumber}</h3>
                </div>
                <p className="text-slate-700 mb-2">
                    <span className="font-semibold">From:</span> {flight.departureAirport}
                    <span className="ml-4 font-semibold">To:</span> {flight.arrivalAirport}
                </p>
                <p className="text-slate-700 mb-2">
                    <span className="font-semibold">Date:</span> {flight.departureDate}
                </p>
                <p className="text-slate-700 mb-4">
                    <span className="font-semibold">Departs:</span> {flight.departureTime}
                    <span className="ml-4 font-semibold">Arrives:</span> {flight.arrivalTime}
                </p>
                {flight.notes && (
                    <p className="text-slate-700 mb-4">
                        <span className="font-semibold">Notes:</span> {flight.notes}
                    </p>
                )}
                {flight.website && (
                    <p className="text-slate-700 mb-4">
                        <span className="font-semibold">Website:</span> <a href={flight.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{flight.website}</a>
                    </p>
                )}
            </div>
            <div className="flex justify-end gap-2">
                {!viewingShared && (
                    <button
                        onClick={handleAddToCalendar}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 transition duration-300"
                    >
                        Add to Calendar
                    </button>
                )}
                {!viewingShared && (
                    <button
                        onClick={() => onDelete(flight)}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-full hover:bg-red-600 transition duration-300"
                    >
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
};

const CarRentalCard = ({ carRental, onDelete, viewingShared }) => {
    const handleAddToCalendar = () => {
        const startDateFormatted = formatDateTimeForGoogleCalendar(carRental.pickupDate, carRental.pickupTime);
        const endDateFormatted = formatDateTimeForGoogleCalendar(carRental.returnDate, carRental.returnTime);
        const title = encodeURIComponent(`${carRental.company} Car Rental`);
        const details = encodeURIComponent(
            `Confirmation: ${carRental.confirmationNumber}\nPickup: ${carRental.pickupLocation}\nReturn: ${carRental.returnLocation}\nNotes: ${carRental.notes || 'N/A'}`
        );
        const location = encodeURIComponent(carRental.pickupLocation);
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateFormatted}/${endDateFormatted}&details=${details}&location=${location}&ctz=${encodeURIComponent(timeZone)}`;
        window.open(googleCalendarUrl, '_blank');
    };

    return (
        <div className="bg-white rounded-xl p-6 card-shadow border-l-8 border-teal-800 flex flex-col justify-between">
            <div>
                <div className="flex items-center mb-3">
                    <svg className="w-7 h-7 text-teal-800 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10v6m0 0v2a2 2 0 002 2h14a2 2 0 002-2v-2m-2-6V6a2 2 0 00-2-2H5a2 2 0 00-2 2v4m0 0h18"></path></svg>
                    <h3 className="text-xl font-bold text-teal-900">Car Rental: {carRental.company}</h3>
                </div>
                <p className="text-slate-700 mb-2">
                    <span className="font-semibold">Confirmation:</span> {carRental.confirmationNumber}
                </p>
                <p className="text-slate-700 mb-2">
                    <span className="font-semibold">Pickup:</span> {carRental.pickupLocation} on {carRental.pickupDate} at {carRental.pickupTime}
                </p>
                <p className="text-slate-700 mb-4">
                    <span className="font-semibold">Return:</span> {carRental.returnLocation} on {carRental.returnDate} at {carRental.returnTime}
                </p>
                {carRental.notes && (
                    <p className="text-slate-700 mb-4">
                        <span className="font-semibold">Notes:</span> {carRental.notes}
                    </p>
                )}
                {carRental.website && (
                    <p className="text-slate-700 mb-4">
                        <span className="font-semibold">Website:</span> <a href={carRental.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{carRental.website}</a>
                    </p>
                    )}
            </div>
            <div className="flex justify-end gap-2">
                {!viewingShared && (
                    <button
                        onClick={handleAddToCalendar}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 transition duration-300"
                    >
                        Add to Calendar
                    </button>
                )}
                {!viewingShared && (
                    <button
                        onClick={() => onDelete(carRental)}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-full hover:bg-red-600 transition duration-300"
                    >
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
};

const EventCard = ({ event, onDelete, viewingShared }) => {
    const handleAddToCalendar = () => {
        const startDateFormatted = formatDateTimeForGoogleCalendar(event.startDate, event.startTime);
        const endDateFormatted = formatDateTimeForGoogleCalendar(event.endDate || event.startDate, event.endTime || event.startTime);
        const title = encodeURIComponent(event.title);
        const details = encodeURIComponent(event.notes || '');
        const location = encodeURIComponent(event.location || '');
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateFormatted}/${endDateFormatted}&details=${details}&location=${location}&ctz=${encodeURIComponent(timeZone)}`;
        window.open(googleCalendarUrl, '_blank');
    };

    return (
        <div className="bg-white rounded-xl p-6 card-shadow border-l-8 border-emerald-800 flex flex-col justify-between">
            <div>
                <div className="flex items-center mb-3">
                    <svg className="w-7 h-7 text-emerald-800 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <h3 className="text-xl font-bold text-emerald-900">Event: {event.title}</h3>
                </div>
                {event.location && (
                    <p className="text-slate-700 mb-2">
                        <span className="font-semibold">Location:</span> {event.location}
                    </p>
                )}
                <p className="text-slate-700 mb-2">
                    <span className="font-semibold">When:</span> {event.startDate} {event.startTime} {event.endDate && ` - ${event.endDate} ${event.endTime}`}
                </p>
                {event.notes && (
                    <p className="text-slate-700 mb-4">
                        <span className="font-semibold">Notes:</span> {event.notes}
                    </p>
                )}
                {event.website && (
                    <p className="text-slate-700 mb-4">
                        <span className="font-semibold">Website:</span> <a href={event.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{event.website}</a>
                    </p>
                )}
            </div>
            <div className="flex justify-end gap-2">
                {!viewingShared && (
                    <button
                        onClick={handleAddToCalendar}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 transition duration-300"
                    >
                        Add to Calendar
                    </button>
                )}
                {!viewingShared && (
                    <button
                        onClick={() => onDelete(event)}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-full hover:bg-red-600 transition duration-300"
                    >
                        Delete
                    </button>
                )}
            </div>
        </div>
    );
};

const DeleteConfirmation = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full text-center">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Confirm Deletion</h3>
            <p className="text-slate-600 mb-6">Are you sure you want to delete this item? This action cannot be undone.</p>
            <div className="flex justify-center gap-4">
                <button
                    onClick={onCancel}
                    className="px-5 py-2 bg-gray-300 text-gray-800 font-semibold rounded-full hover:bg-gray-400 transition duration-300"
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    className="px-5 py-2 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 transition duration-300"
                >
                    Delete
                </button>
            </div>
        </div>
    </div>
);

// Wrapper component to provide Firebase context to the App
const Root = () => (
    <FirebaseProvider>
        <App />
    </FirebaseProvider>
);

export default Root;
