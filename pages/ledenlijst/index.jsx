import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  fetchUsers,
  deleteUserById,
  fetchClubById,
} from "../../src/services/api";
import { useAuth } from "../../src/services/auth";
import {
  FunnelIcon,
  UserPlusIcon,
  TrashIcon,
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import * as XLSX from "xlsx";
import Loading from "../../components/Loading";

// Helper function to calculate age
const calculateAge = (birthDate) => {
  if (!birthDate) return "Onbekend";

  const birth = new Date(birthDate);
  const today = new Date();

  // Check if date is valid
  if (isNaN(birth.getTime())) return "Onbekend";

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  // Adjust age if birthday hasn't occurred this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return `${age}J`;
};

// Helper function to check insurance status
const checkInsuranceStatus = (vechterInfo) => {
  // If using old system (no vervalDatum), always return "Niet in orde"
  if (!vechterInfo?.vervalDatum) {
    return { text: "Niet in orde", type: "error" };
  }

  const today = new Date();
  const expiryDate = new Date(vechterInfo.vervalDatum);

  // Check if date is valid
  if (isNaN(expiryDate.getTime())) {
    return { text: "Niet in orde", type: "error" };
  }

  // Calculate days until expiry
  const daysUntilExpiry = Math.ceil(
    (expiryDate - today) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) {
    return { text: "Niet in orde", type: "error" };
  } else if (daysUntilExpiry <= 30) {
    // Within 1 months
    return { text: `Verloopt over ${daysUntilExpiry} dagen`, type: "warning" };
  } else {
    return { text: "In Orde", type: "ok" };
  }
};

// Reusable Double Range Slider Component
const DoubleRangeSlider = ({
  min,
  max,
  step = 1,
  values,
  onChange,
  unit = "",
}) => {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const minBubbleRef = useRef(null);
  const maxBubbleRef = useRef(null);

  useEffect(() => {
    updateRangeTrack();
  }, [values]);

  const updateRangeTrack = () => {
    if (!containerRef.current || !trackRef.current) return;

    const minPercent = ((values.min - min) / (max - min)) * 100;
    const maxPercent = ((values.max - min) / (max - min)) * 100;

    trackRef.current.style.left = `${minPercent}%`;
    trackRef.current.style.width = `${maxPercent - minPercent}%`;

    if (minBubbleRef.current) {
      minBubbleRef.current.style.left = `${minPercent}%`;
      minBubbleRef.current.textContent = `${values.min}${unit}`;
    }

    if (maxBubbleRef.current) {
      maxBubbleRef.current.style.left = `${maxPercent}%`;
      maxBubbleRef.current.textContent = `${values.max}${unit}`;
    }
  };

  const handleMinChange = (e) => {
    const newMin = parseInt(e.target.value);
    if (newMin <= values.max) {
      onChange({ min: newMin, max: values.max });
    }
  };

  const handleMaxChange = (e) => {
    const newMax = parseInt(e.target.value);
    if (newMax >= values.min) {
      onChange({ min: values.min, max: newMax });
    }
  };

  return (
    <div className="double-range-container">
      <div className="double-range-slider" ref={containerRef}>
        <div className="slider-background"></div>
        <span className="range-track" ref={trackRef}></span>
        <input
          type="range"
          className="min-range"
          min={min}
          max={max}
          step={step}
          value={values.min}
          onChange={handleMinChange}
        />
        <input
          type="range"
          className="max-range"
          min={min}
          max={max}
          step={step}
          value={values.max}
          onChange={handleMaxChange}
        />
        <div className="min-value-bubble" ref={minBubbleRef}></div>
        <div className="max-value-bubble" ref={maxBubbleRef}></div>
      </div>
    </div>
  );
};

const LedenlijstPage = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [leden, setLeden] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const [sliderValues, setSliderValues] = useState({
    leeftijd: { min: 1, max: 60 },
    gewicht: { min: 20, max: 120 },
  });
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [clubName, setClubName] = useState("");
  const [clubMembers, setClubMembers] = useState([]);
  const [selectedFighters, setSelectedFighters] = useState([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    gewicht: "",
    leeftijd: "",
    klasse: "",
    verzekering: "",
  });

  // Add role-based redirection
  useEffect(() => {
    if (!loading && user) {
      console.log(user.role);
      if (user.role === "VKBMO-lid") {
        router.push("/clubs");
        return;
      } else if (user.role === "Vechter") {
        router.push("/dashboard");
        return;
      }
    }
  }, [loading, user, router]);

  // Fetch club name
  useEffect(() => {
    const fetchClubName = async () => {
      if (user?.club) {
        try {
          console.log("Fetching club data for ID:", user.club); // Debug log
          const clubData = await fetchClubById(user.club);
          console.log("Received club data:", clubData); // Debug log

          if (clubData && clubData.naam) {
            console.log("Setting club name to:", clubData.naam); // Debug log
            setClubName(clubData.naam);
          } else {
            console.error("Club data missing or invalid:", {
              hasData: !!clubData,
              hasName: !!clubData?.naam,
              clubData,
            });
          }
        } catch (error) {
          console.error("Error fetching club name:", {
            error: error.message,
            response: error.response?.data,
            clubId: user.club,
          });
        }
      } else {
        console.log("No club ID available in user data:", user); // Debug log
      }
    };

    if (user) {
      fetchClubName();
    }
  }, [user]);

  // Mobile detection effect
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load data effect
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      try {
        setIsLoading(true);
        const data = await fetchUsers();

        if (!data) {
          console.error("Geen data ontvangen van fetchUsers");
          return;
        }

        console.log("Raw API data:", data); // Debug log to see the raw API response

        const clubMembers = data.filter(
          (u) => u.club === user?.club && u.role === "Vechter"
        );

        console.log("Filtered club members:", clubMembers); // Debug log to see filtered members
        console.log("Sample member fights:", clubMembers[0]?.fights); // Debug log to see fights structure

        const mappedLeden = clubMembers.map((user) => ({
          id: user._id,
          voornaam: user.voornaam,
          achternaam: user.achternaam,
          email: user.email,
          geboortedatum: user.geboortedatum,
          vechterInfo: user.vechterInfo,
          fights: user.fights, // Make sure fights is included in the mapped data
          createdAt: user.createdAt,
          naam: `${user.voornaam} ${user.achternaam}`,
          gewichtscategorie: `${user.vechterInfo?.gewicht || "Onbekend"} kg`,
          leeftijd: calculateAge(user.geboortedatum),
          klasse: user.vechterInfo?.klasse || "Onbekend",
          verzekering: checkInsuranceStatus(user.vechterInfo),
        }));

        setClubMembers(clubMembers);
        setLeden(mappedLeden);
      } catch (error) {
        console.error("Fout bij laden van leden:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!loading && user) {
      loadData();
    }
  }, [loading, user]);

  // Initialize slider ranges effect
  useEffect(() => {
    setSliderValues({
      leeftijd: { min: 1, max: 60 },
      gewicht: { min: 20, max: 120 },
    });
  }, []);

  // Get unique values for filter options
  const getUniqueValues = (key) => {
    const values = new Set();
    leden.forEach((lid) => {
      if (key === "leeftijd") {
        values.add(lid.leeftijd);
      } else if (key === "gewicht") {
        values.add(lid.gewichtscategorie);
      } else if (key === "klasse") {
        values.add(lid.klasse);
      } else if (key === "verzekering") {
        values.add(lid.verzekering.text);
      }
    });
    return Array.from(values).sort();
  };

  // Get min and max values for sliders
  const getMinMaxValues = (key) => {
    if (key === "leeftijd") {
      return { min: 1, max: 60 }; // Always return fixed range for age
    }

    const values = leden
      .map((lid) => {
        if (key === "gewicht") {
          return parseInt(lid.gewichtscategorie.replace(" kg", ""));
        }
        return 0;
      })
      .filter((val) => !isNaN(val));

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  };

  // Fixed filter options
  const klasseOptions = [
    "A Klasse",
    "B Klasse",
    "C Klasse",
    "Nieuweling",
    "Jeugd",
  ];

  // Helper function to format klasse for display
  const formatKlasse = (klasse) => {
    if (klasse === "Nieuweling" || klasse === "Jeugd") return klasse;
    return klasse.split(" ")[0]; // Returns just "A", "B", or "C"
  };

  const verzekeringOptions = [
    { value: "In Orde", label: "Gereed" },
    { value: "Verloopt over", label: "Vervalend" },
    { value: "Niet in orde", label: "Verlopen" },
  ];

  useEffect(() => {
    // Range slider functionality
    const updateRangeTrack = (type) => {
      const container = document.querySelector(
        `#${type}-range-track`
      )?.parentElement;
      if (!container) return;

      const track = container.querySelector(".range-track");
      const minInput = container.querySelector(".min-range");
      const maxInput = container.querySelector(".max-range");
      const minBubble = container.querySelector(".min-value-bubble");
      const maxBubble = container.querySelector(".max-value-bubble");

      if (!track || !minInput || !maxInput) return;

      const min = parseInt(minInput.value);
      const max = parseInt(maxInput.value);
      const minPercent =
        ((min - minInput.min) / (minInput.max - minInput.min)) * 100;
      const maxPercent =
        ((max - maxInput.min) / (maxInput.max - maxInput.min)) * 100;

      // Update track position
      track.style.left = `${minPercent}%`;
      track.style.right = `${100 - maxPercent}%`;

      // Update value bubbles
      if (minBubble) {
        minBubble.style.left = `${minPercent}%`;
        minBubble.textContent = type === "leeftijd" ? `${min}J` : `${min} kg`;
      }
      if (maxBubble) {
        maxBubble.style.left = `${maxPercent}%`;
        maxBubble.textContent = type === "leeftijd" ? `${max}J` : `${max} kg`;
      }
    };

    // Add event listeners for real-time updates
    const addSliderListeners = (type) => {
      const container = document.querySelector(
        `#${type}-range-track`
      )?.parentElement;
      if (!container) return;

      const inputs = container.querySelectorAll('input[type="range"]');
      inputs.forEach((input) => {
        const updateHandler = () => {
          updateRangeTrack(type);
          // Ensure z-index is correct when dragging
          if (input.classList.contains("min-range")) {
            input.style.zIndex = "3";
            container.querySelector(".max-range").style.zIndex = "2";
          } else {
            input.style.zIndex = "3";
            container.querySelector(".min-range").style.zIndex = "2";
          }
        };
        input.addEventListener("input", updateHandler);
        input.addEventListener("mousedown", () => {
          input.style.zIndex = "3";
          const otherInput = input.classList.contains("min-range")
            ? container.querySelector(".max-range")
            : container.querySelector(".min-range");
          if (otherInput) otherInput.style.zIndex = "2";
        });
      });
    };

    // Initial update and add listeners
    requestAnimationFrame(() => {
      updateRangeTrack("leeftijd");
      updateRangeTrack("gewicht");
      addSliderListeners("leeftijd");
      addSliderListeners("gewicht");
    });

    // Cleanup function
    return () => {
      const removeSliderListeners = (type) => {
        const container = document.querySelector(
          `#${type}-range-track`
        )?.parentElement;
        if (!container) return;

        const inputs = container.querySelectorAll('input[type="range"]');
        inputs.forEach((input) => {
          const updateHandler = () => updateRangeTrack(type);
          input.removeEventListener("input", updateHandler);
          input.removeEventListener("mousedown", () => {});
        });
      };
      removeSliderListeners("leeftijd");
      removeSliderListeners("gewicht");
    };
  }, [leden]);

  // Show loading state while either auth is loading or data is being fetched
  if (loading || isLoading) {
    return <Loading />;
  }

  // Show message if no user is logged in
  if (!user) {
    return (
      <div className="leden-container">
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p>Je moet ingelogd zijn om de ledenlijst te bekijken.</p>
        </div>
      </div>
    );
  }

  const toggleFighterSelection = (id, e) => {
    e.stopPropagation(); // Prevent row click when clicking checkbox
    setSelectedFighters((prev) => {
      if (prev.includes(id)) {
        return prev.filter((fighterId) => fighterId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleRowClick = (id) => {
    if (isSelectMode) {
      setSelectedFighters((prev) => {
        if (prev.includes(id)) {
          return prev.filter((fighterId) => fighterId !== id);
        } else {
          return [...prev, id];
        }
      });
    } else {
      router.push(`/member/${id}`);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // Prevent row click event
    if (window.confirm("Weet je zeker dat je dit lid wilt verwijderen?")) {
      try {
        await deleteUserById(id);
        // Refresh the list after deletion
        const updatedLeden = leden.filter((lid) => lid.id !== id);
        setLeden(updatedLeden);
      } catch (error) {
        console.error("Fout bij verwijderen lid:", error);
        alert("Er is een fout opgetreden bij het verwijderen van het lid");
      }
    }
  };

  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      gewicht: "",
      leeftijd: "",
      klasse: "",
      verzekering: "",
    });

    setSliderValues({
      leeftijd: { min: 1, max: 60 },
      gewicht: { min: 20, max: 120 },
    });
  };

  const handleSliderChange = (filterType, newValues) => {
    setSliderValues((prev) => ({
      ...prev,
      [filterType]: newValues,
    }));

    if (filterType === "leeftijd") {
      if (newValues.min === 1 && newValues.max === 60) {
        handleFilterChange("leeftijd", "");
      } else {
        handleFilterChange("leeftijd", `${newValues.min}-${newValues.max}`);
      }
    } else if (filterType === "gewicht") {
      if (newValues.min === 20 && newValues.max === 120) {
        handleFilterChange("gewicht", "");
      } else {
        handleFilterChange("gewicht", `${newValues.min}-${newValues.max}`);
      }
    }
  };

  const toggleFilter = (filterName) => {
    setOpenFilter(openFilter === filterName ? null : filterName);
  };

  const filteredLeden = leden.filter((lid) => {
    // First apply search term filter
    const searchMatch = [
      lid.naam,
      lid.gewichtscategorie,
      lid.leeftijd,
      lid.klasse,
      lid.verzekering.text,
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    // Apply slider filters
    const leeftijdMatch = (() => {
      if (!filters.leeftijd) return true;
      const leeftijd = parseInt(lid.leeftijd);
      return (
        leeftijd >= sliderValues.leeftijd.min &&
        leeftijd <= sliderValues.leeftijd.max
      );
    })();

    const gewichtMatch = (() => {
      if (!filters.gewicht) return true;
      const gewicht = parseInt(lid.gewichtscategorie.replace(" kg", ""));
      return (
        gewicht >= sliderValues.gewicht.min &&
        gewicht <= sliderValues.gewicht.max
      );
    })();

    // Apply other filters
    const klasseMatch = !filters.klasse || lid.klasse === filters.klasse;

    // Special handling for verzekering filter
    const verzekeringMatch =
      !filters.verzekering ||
      (filters.verzekering === "In Orde" &&
        lid.verzekering.text === "In Orde") ||
      (filters.verzekering === "Verloopt over" &&
        lid.verzekering.text.includes("Verloopt over")) ||
      (filters.verzekering === "Niet in orde" &&
        lid.verzekering.text === "Niet in orde");

    return (
      searchMatch &&
      leeftijdMatch &&
      gewichtMatch &&
      klasseMatch &&
      verzekeringMatch
    );
  });

  const exportToExcel = () => {
    console.log("Exporting with club members:", clubMembers);

    const worksheetData = filteredLeden.map((lid) => {
      // Zoek het originele user object op basis van id
      const userData = clubMembers.find((u) => u._id === lid.id);
      console.log(`User ${lid.id} vechterInfo:`, userData?.vechterInfo); // Debug log for vechterInfo

      // Access fights from vechterInfo instead of directly from userData
      const fightsCount = Array.isArray(userData?.vechterInfo?.fights)
        ? userData.vechterInfo.fights.length
        : 0;

      console.log(`User ${lid.id} fights count:`, fightsCount);

      return {
        Naam: `${userData.voornaam} ${userData.achternaam}`,
        Email: userData.email,
        Geboortedatum: new Date(userData.geboortedatum).toLocaleDateString(
          "nl-NL"
        ),
        Leeftijd: lid.leeftijd,
        Gewicht: userData.vechterInfo?.gewicht || "",
        Lengte: userData.vechterInfo?.lengte || "",
        Klasse: userData.vechterInfo?.klasse || "",
        "Verzekering Vervaldatum": userData.vechterInfo?.vervalDatum
          ? new Date(userData.vechterInfo.vervalDatum).toLocaleDateString(
              "nl-NL"
            )
          : "",
        "Aantal Gevechten": fightsCount,
      };
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(worksheetData);

    // Set column widths
    const colWidths = [
      { wch: 30 }, // Naam
      { wch: 25 }, // Email
      { wch: 15 }, // Geboortedatum
      { wch: 10 }, // Leeftijd
      { wch: 10 }, // Gewicht
      { wch: 10 }, // Lengte
      { wch: 15 }, // Klasse
      { wch: 20 }, // Verzekering Vervaldatum
      { wch: 15 }, // Aantal Gevechten
    ];
    ws["!cols"] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Ledenlijst");

    // Generate filename with club name and date
    const date = new Date()
      .toLocaleDateString("nl-NL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-");

    // Use the actual club name from the state, with fallback
    const safeClubName = clubName
      ? clubName.replace(/[^a-zA-Z0-9]/g, "_")
      : "Club";

    console.log("Exporting with club name:", safeClubName); // Debug log

    const filename = `FightZone_${safeClubName}_Ledenlijst_${date}.xlsx`;

    // Save the file
    XLSX.writeFile(wb, filename);
  };

  const handleSelectiveExport = () => {
    if (selectedFighters.length === 0) {
      alert("Selecteer ten minste één vechter om te exporteren");
      return;
    }

    const selectedMembers = clubMembers.filter((member) =>
      selectedFighters.includes(member._id)
    );

    const worksheetData = selectedMembers.map((userData) => {
      const fightsCount = Array.isArray(userData?.vechterInfo?.fights)
        ? userData.vechterInfo.fights.length
        : 0;

      return {
        Naam: `${userData.voornaam} ${userData.achternaam}`,
        Email: userData.email,
        Geboortedatum: new Date(userData.geboortedatum).toLocaleDateString(
          "nl-NL"
        ),
        Leeftijd: calculateAge(userData.geboortedatum),
        Gewicht: userData.vechterInfo?.gewicht || "",
        Lengte: userData.vechterInfo?.lengte || "",
        Klasse: userData.vechterInfo?.klasse || "",
        "Verzekering Vervaldatum": userData.vechterInfo?.vervalDatum
          ? new Date(userData.vechterInfo.vervalDatum).toLocaleDateString(
              "nl-NL"
            )
          : "",
        "Aantal Gevechten": fightsCount,
      };
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(worksheetData);

    // Set column widths
    const colWidths = [
      { wch: 30 }, // Naam
      { wch: 25 }, // Email
      { wch: 15 }, // Geboortedatum
      { wch: 10 }, // Leeftijd
      { wch: 10 }, // Gewicht
      { wch: 10 }, // Lengte
      { wch: 15 }, // Klasse
      { wch: 20 }, // Verzekering Vervaldatum
      { wch: 15 }, // Aantal Gevechten
    ];
    ws["!cols"] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Geselecteerde Vechters");

    // Generate filename
    const date = new Date()
      .toLocaleDateString("nl-NL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-");

    const safeClubName = clubName
      ? clubName.replace(/[^a-zA-Z0-9]/g, "_")
      : "Club";

    const filename = `FightZone_${safeClubName}_Geselecteerde_Vechters_${date}.xlsx`;

    // Save the file
    XLSX.writeFile(wb, filename);

    // Reset selection mode and selected fighters
    setIsSelectMode(false);
    setSelectedFighters([]);
  };

  return (
    <div className="leden-container" style={{ overflowX: "hidden" }}>
      <div className="header-section">
        <div>
          <h1 className="leden-title">Ledenlijst</h1>
        </div>
        <div className="button-group">
          <button
            className={`filter-button ${showFilters ? "active" : ""}`}
            onClick={() => {
              if (isMobile) {
                setShowMobileFilters(true);
              } else {
                setShowFilters(!showFilters);
              }
            }}
          >
            <FunnelIcon className="button-icon" width={20} height={20} />
            Filter
          </button>
          <Link href="ledenlijst/add-member" className="add-member-button">
            <UserPlusIcon className="button-icon" width={20} height={20} />
            Voeg lid toe
          </Link>
        </div>
      </div>

      {/* Desktop Filters */}
      {!isMobile && showFilters && (
        <div className="filter-dropdowns">
          <div className="filter-grid">
            <div className="filter-group full-width">
              <h4 className="filter-label">Gewicht</h4>
              <DoubleRangeSlider
                min={20}
                max={120}
                values={sliderValues.gewicht}
                onChange={(newValues) =>
                  handleSliderChange("gewicht", newValues)
                }
                unit=" kg"
              />
            </div>

            <div className="filter-group full-width">
              <h4 className="filter-label">Leeftijd</h4>
              <DoubleRangeSlider
                min={1}
                max={60}
                values={sliderValues.leeftijd}
                onChange={(newValues) =>
                  handleSliderChange("leeftijd", newValues)
                }
                unit="J"
              />
            </div>

            <div className="filter-group">
              <h4 className="filter-label">Klasse</h4>
              <select
                value={filters.klasse}
                onChange={(e) => handleFilterChange("klasse", e.target.value)}
              >
                <option value="">Alle klassen</option>
                {klasseOptions.map((klasse) => (
                  <option key={klasse} value={klasse}>
                    {formatKlasse(klasse)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <h4 className="filter-label">Verzekering</h4>
              <select
                value={filters.verzekering}
                onChange={(e) =>
                  handleFilterChange("verzekering", e.target.value)
                }
              >
                <option value="">Alle statussen</option>
                {verzekeringOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={clearFilters} className="clear-filters">
              Wissen
            </button>
          </div>
        </div>
      )}

      {/* Mobile Filter Popup */}
      {isMobile && showMobileFilters && (
        <>
          <div
            className="mobile-filter-overlay"
            onClick={() => setShowMobileFilters(false)}
          />
          <div className="mobile-filter-popup">
            <div className="mobile-filter-header">
              <div className="mobile-filter-title">
                <FunnelIcon className="button-icon" width={20} height={20} />
                <span>Filters</span>
              </div>
              <button
                className="close-filter-button"
                onClick={() => setShowMobileFilters(false)}
              >
                <XMarkIcon width={24} height={24} />
              </button>
            </div>

            <div className="mobile-filter-content">
              {/* Leeftijd Filter */}
              <div className="mobile-filter-section">
                <button
                  className="mobile-filter-label"
                  onClick={() => toggleFilter("leeftijd")}
                >
                  <span>Leeftijd</span>
                  {openFilter === "leeftijd" ? (
                    <MinusIcon width={20} height={20} />
                  ) : (
                    <PlusIcon width={20} height={20} />
                  )}
                </button>

                {openFilter === "leeftijd" && (
                  <div className="mobile-filter-slider">
                    <DoubleRangeSlider
                      min={1}
                      max={60}
                      values={sliderValues.leeftijd}
                      onChange={(newValues) =>
                        handleSliderChange("leeftijd", newValues)
                      }
                      unit="J"
                    />
                  </div>
                )}
              </div>

              {/* Gewicht Filter */}
              <div className="mobile-filter-section">
                <button
                  className="mobile-filter-label"
                  onClick={() => toggleFilter("gewicht")}
                >
                  <span>Gewicht</span>
                  {openFilter === "gewicht" ? (
                    <MinusIcon width={20} height={20} />
                  ) : (
                    <PlusIcon width={20} height={20} />
                  )}
                </button>

                {openFilter === "gewicht" && (
                  <div className="mobile-filter-slider">
                    <DoubleRangeSlider
                      min={20}
                      max={120}
                      values={sliderValues.gewicht}
                      onChange={(newValues) =>
                        handleSliderChange("gewicht", newValues)
                      }
                      unit=" kg"
                    />
                  </div>
                )}
              </div>

              {/* Klasse Filter */}
              <div className="mobile-filter-section">
                <button
                  className="mobile-filter-label"
                  onClick={() => toggleFilter("klasse")}
                >
                  <span>Klasse</span>
                  {openFilter === "klasse" ? (
                    <MinusIcon width={20} height={20} />
                  ) : (
                    <PlusIcon width={20} height={20} />
                  )}
                </button>

                {openFilter === "klasse" && (
                  <div className="mobile-filter-options">
                    {klasseOptions.map((klasse) => (
                      <button
                        key={klasse}
                        className={`filter-option ${
                          filters.klasse === klasse ? "active" : ""
                        }`}
                        onClick={() => handleFilterChange("klasse", klasse)}
                      >
                        {formatKlasse(klasse)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Verzekering Filter */}
              <div className="mobile-filter-section">
                <button
                  className="mobile-filter-label"
                  onClick={() => toggleFilter("verzekering")}
                >
                  <span>Verzekering</span>
                  {openFilter === "verzekering" ? (
                    <MinusIcon width={20} height={20} />
                  ) : (
                    <PlusIcon width={20} height={20} />
                  )}
                </button>

                {openFilter === "verzekering" && (
                  <div className="mobile-filter-options">
                    {verzekeringOptions.map(({ value, label }) => (
                      <button
                        key={value}
                        className={`filter-option ${
                          filters.verzekering === value ? "active" : ""
                        }`}
                        onClick={() => handleFilterChange("verzekering", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mobile-filter-footer">
              <button onClick={clearFilters} className="clear-filters">
                Filters wissen
              </button>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="apply-filters"
              >
                Toepassen
              </button>
            </div>
          </div>
        </>
      )}

      <input
        type="text"
        className="search-input"
        placeholder={"Zoek op naam, gewicht, leeftijd of klasse..."}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Export Button and Dropdown */}
      <div className="export-container">
        <button
          className="export-button"
          onClick={() => setShowExportDropdown(!showExportDropdown)}
        >
          <ArrowDownTrayIcon className="button-icon" width={20} height={20} />
          Exporteren
          <ChevronDownIcon
            className={`dropdown-icon ${showExportDropdown ? "rotate" : ""}`}
            width={16}
            height={16}
          />
        </button>
        {showExportDropdown && (
          <div className="export-dropdown">
            <button
              className="export-option"
              onClick={() => {
                exportToExcel();
                setShowExportDropdown(false);
              }}
            >
              Exporteer volledige lijst
            </button>
            <button
              className="export-option"
              onClick={() => {
                setIsSelectMode(true);
                setShowExportDropdown(false);
              }}
            >
              Selecteer vechters om te exporteren
            </button>
          </div>
        )}
      </div>

      {/* Add selection mode indicator and export button */}
      {isSelectMode && (
        <div className="selection-mode-bar">
          <div className="selection-info">
            {selectedFighters.length} vechter(s) geselecteerd
          </div>
          <div className="selection-actions">
            <button
              className="cancel-selection"
              onClick={() => {
                setIsSelectMode(false);
                setSelectedFighters([]);
              }}
            >
              Annuleren
            </button>
            <button
              className="export-selected"
              onClick={handleSelectiveExport}
              disabled={selectedFighters.length === 0}
            >
              Exporteer geselecteerde
            </button>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className={`leden-tabel ${isSelectMode ? "select-mode" : ""}`}>
          <thead>
            <tr>
              {isSelectMode && <th className="checkbox-column"></th>}
              <th className="name-column">Naam</th>
              {!isMobile && <th className="weight-column">Gewicht</th>}
              <th className="age-column">Leeftijd</th>
              {!isMobile && <th className="class-column">Klasse</th>}
              <th className="insurance-column">Verzekering</th>
              <th className="action-column"></th>
            </tr>
          </thead>
          <tbody>
            {filteredLeden.map((lid, i) => (
              <tr
                key={i}
                onClick={() => handleRowClick(lid.id)}
                className={selectedFighters.includes(lid.id) ? "selected" : ""}
                style={{ cursor: isSelectMode ? "pointer" : "pointer" }}
              >
                {isSelectMode && (
                  <td
                    className="checkbox-column"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFighters.includes(lid.id)}
                      onChange={(e) => toggleFighterSelection(lid.id, e)}
                      className="fighter-checkbox"
                    />
                  </td>
                )}
                <td className="name-column">{lid.naam}</td>
                {!isMobile && (
                  <td className="weight-column">-{lid.gewichtscategorie}</td>
                )}
                <td className="age-column">{lid.leeftijd}</td>
                {!isMobile && (
                  <td className="class-column">{formatKlasse(lid.klasse)}</td>
                )}
                <td className="insurance-column">
                  <span
                    className={`insurance-badge insurance-${lid.verzekering.type}`}
                  >
                    {isMobile
                      ? lid.verzekering.text
                          .replace("Verloopt over", "")
                          .replace("dagen", "Dagen")
                      : lid.verzekering.text}
                  </span>
                </td>
                <td className="action-column">
                  <button
                    onClick={(e) => handleDelete(e, lid.id)}
                    className="delete-button"
                    title="Verwijder lid"
                  >
                    <TrashIcon className="delete-icon" width={20} height={20} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .leden-container {
          padding: 1rem;
          overflow-x: hidden;
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          -ms-overflow-style: -ms-autohiding-scrollbar;
        }

        .selection-mode-bar {
          width: 100%;
          box-sizing: border-box;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background-color: #f8f9fb;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .selection-info {
          font-weight: 500;
          color: #0b48ab;
        }

        .selection-actions {
          display: flex;
          gap: 1rem;
        }

        .cancel-selection {
          padding: 0.5rem 1rem;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-selection:hover {
          background-color: #f5f5f5;
        }

        .export-selected {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          background-color: #3483fe;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .export-selected:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .export-selected:not(:disabled):hover {
          background-color: #2b6cd9;
        }

        .checkbox-column {
          width: 40px;
          text-align: center;
          padding: 0 10px;
        }

        .fighter-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .leden-tabel.select-mode tr.selected {
          background-color: rgba(52, 131, 254, 0.1);
        }

        .leden-tabel.select-mode tr:hover {
          background-color: rgba(52, 131, 254, 0.05);
        }

        @media (max-width: 480px) {
          .checkbox-column {
            display: none;
          }

          .leden-tabel.select-mode th:first-child,
          .leden-tabel.select-mode td:first-child {
            display: none;
          }

          .selection-mode-bar {
            flex-direction: column;
            gap: 0.5rem;
            align-items: flex-start;
            border-radius: 0;
            padding: 0.75rem 1rem;
          }

          .selection-actions {
            width: 100%;
            justify-content: space-between;
          }

          .selection-actions button {
            flex: 1;
          }

          .table-responsive {
          }

          .leden-tabel {
            border-radius: 0;
            border-left: none;
            border-right: none;
          }

          .name-column {
            width: 40%;
          }

          .age-column {
            width: 20%;
          }

          .insurance-column {
            width: 35%;
          }

          .action-column {
            width: 5%;
          }

          .insurance-badge {
            padding: 4px 8px;
            font-size: 11px;
          }
        }

        /* Add all the filter styles from cluboverzicht */
        .filter-dropdowns {
          margin-bottom: 1.5rem;
        }

        .filter-grid {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
        }

        .filter-group {
          flex: 1;
        }

        .filter-group.full-width {
          grid-column: span 2;
        }

        .filter-label {
          margin-bottom: 0.5rem;
          font-weight: 600;
          color: #0b48ab;
          font-size: 0.95rem;
        }

        /* Mobile Filter Styles */
        .mobile-filter-popup {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          border-radius: 20px 20px 0 0;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .mobile-filter-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
        }

        .mobile-filter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #eee;
        }

        .mobile-filter-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 1.1rem;
          color: #0b48ab;
        }

        .mobile-filter-content {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .mobile-filter-section {
          border-bottom: 1px solid #eee;
        }

        .mobile-filter-label {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          background: none;
          border: none;
          font-size: 1rem;
          font-weight: 500;
          color: #0b48ab;
          cursor: pointer;
        }

        .mobile-filter-slider {
          padding: 10px 0;
          background: white;
          border-radius: 8px;
          display: flex;
          justify-content: center;
        }

        .mobile-filter-options {
          padding: 0.5rem;
          display: flex;
          gap: 0.5rem;
          background-color: #f0f6ff;
          border-radius: 8px;
        }

        .filter-option {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 6px;
          background-color: rgba(52, 131, 254, 0.3);
          text-align: center;
          font-size: 0.95rem;
          color: var(--text-color);
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-option.active {
          background-color: #3483fe;
          color: white;
        }

        .mobile-filter-footer {
          padding: 1rem;
          border-top: 1px solid #eee;
          display: flex;
          gap: 1rem;
        }

        .mobile-filter-footer button {
          flex: 1;
          padding: 0.75rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mobile-filter-footer .clear-filters {
          background: none;
          border: 1px solid #ddd;
          color: var(--text-color);
        }

        .mobile-filter-footer .apply-filters {
          background-color: #3483fe;
          border: none;
          color: white;
        }

        .mobile-filter-footer .clear-filters:hover {
          background-color: #f5f5f5;
        }

        .mobile-filter-footer .apply-filters:hover {
          background-color: #0b48ab;
        }

        /* Double Range Slider Styles */
        .double-range-container {
          display: flex;
          justify-content: center;
          width: 95%;
        }

        .double-range-slider {
          position: relative;
          height: 40px;
          width: calc(100% - 20px);
          margin: 20px 0;
          padding: 0;
        }

        .slider-background {
          position: absolute;
          height: 4px;
          background-color: #d6e6ff;
          border-radius: 2px;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          z-index: 0;
        }

        .range-track {
          position: absolute;
          height: 4px;
          background-color: rgba(52, 131, 254, 0.5);
          border-radius: 2px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          z-index: 1;
        }

        .double-range-slider input[type="range"] {
          position: absolute;
          width: 100%;
          height: 4px;
          background: none;
          pointer-events: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2;
          margin: 0;
          padding: 0;
        }

        .double-range-slider input[type="range"]::-webkit-slider-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          border: 2px solid #3483fe;
          background-color: white;
          pointer-events: auto;
          -webkit-appearance: none;
          cursor: pointer;
          z-index: 3;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .double-range-slider input[type="range"]::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          border: 2px solid #3483fe;
          background-color: white;
          pointer-events: auto;
          -moz-appearance: none;
          cursor: pointer;
          z-index: 3;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .min-value-bubble,
        .max-value-bubble {
          position: absolute;
          padding: 4px 8px;
          background: white;
          border: 1px solid #d6e6ff;
          border-radius: 12px;
          color: #0b48ab;
          font-size: 12px;
          font-weight: 500;
          transform: translateX(-50%);
          top: -28px;
          pointer-events: none;
          transition: left 0.1s ease-out;
          z-index: 4;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          white-space: nowrap;
        }

        .min-value-bubble::after,
        .max-value-bubble::after {
          content: "";
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 4px solid #d6e6ff;
        }
      `}</style>
    </div>
  );
};

export const getInitialProps = async () => {
  return { props: {} };
};

LedenlijstPage.getInitialProps = getInitialProps;

export default LedenlijstPage;
