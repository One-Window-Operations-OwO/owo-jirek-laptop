"use client";

import { useEffect, useState, useRef, act } from "react";
import Login from "@/components/Login";
import Sidebar, {
  defaultEvaluationValues,
  EvaluationField,
} from "@/components/Sidebar";
import StickyInfoBox from "@/components/StickyInfoBox";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface ApprovalLog {
  date: string;
  status: string;
  user: string;
  note: string;
}
// Helper Interface
interface ExtractedData {
  school: Record<string, string>;
  item: Record<string, string>;
  images: Array<{ src: string; title: string }>;
  history: ApprovalLog[]; // Simple array of strings for history
  extractedId: string;
  resi: string;
  bapp_id: string;
  bapp_date: string;
}

export default function Home() {
  const [dacAuthenticated, setDacAuthenticated] = useState(false);
  const [dataSourceAuthenticated, setDataSourceAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Data State
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

  // Detail State
  const [selectedSn, setSelectedSn] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ExtractedData | null>(null);
  const [currentExtractedId, setCurrentExtractedId] = useState<string | null>(
    null,
  );
  const [rawDataHtml, setRawDataHtml] = useState<string>("");

  // Form State
  const [evaluationForm, setEvaluationForm] = useState(defaultEvaluationValues);
  const [sidebarOptions, setSidebarOptions] = useState<EvaluationField[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snBapp, setSnBapp] = useState("");

  // Sidebar Layout State
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">(
    "left",
  );
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [enableManualNote, setEnableManualNote] = useState(false); // Default OFF
  const [pendingApprovalData, setPendingApprovalData] = useState<any>(null);

  const [dacUsername, setDacUsername] = useState("");
  const [dataSourceUsername, setDataSourceUsername] = useState("");

  useEffect(() => {
    const storedPos = localStorage.getItem("sidebar_layout");
    if (storedPos === "left" || storedPos === "right") {
      setSidebarPosition(storedPos);
    }
  }, []);

  const handleSetSidebarPosition = (pos: "left" | "right") => {
    setSidebarPosition(pos);
    localStorage.setItem("sidebar_layout", pos);
  };
  const [id, setId] = useState("");

  // Image Viewer State
  const [currentImageIndex, setCurrentImageIndex] = useState<number | null>(
    null,
  );
  const [imageRotation, setImageRotation] = useState(0);

  // Verification Date
  const [verificationDate, setVerificationDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    // Check localStorage for BACKWARD COMPATIBILITY
    const oldSession = localStorage.getItem("ci_session");
    if (oldSession && !localStorage.getItem("dac_session")) {
      localStorage.setItem("dac_session", oldSession);
      localStorage.removeItem("ci_session");
    }

    // Auto-refresh using stored credentials
    const refreshSession = async (type: "dac" | "datasource") => {
      const stored = localStorage.getItem(`login_cache_${type}`);
      if (stored) {
        try {
          const { username, password } = JSON.parse(stored);
          if (username && password) {
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, password, type }),
            });
            const json = await res.json();

            if (json.success) {
              let sessionValue = "";

              if (type === "dac") {
                // Perbaikan: Ambil token dari json.data.token
                sessionValue = json.data?.token || "";
              } else {
                // Logic untuk datasource tetap menggunakan cookie match
                const match = json.cookie?.match(
                  /(?:token|ci_session)=([^;]+)/,
                );
                sessionValue = match ? match[1] : json.cookie;
              }

              if (sessionValue) {
                localStorage.setItem(`${type}_session`, sessionValue);
                if (type === "dac") setDacAuthenticated(true);
                if (type === "datasource") setDataSourceAuthenticated(true);
              }
            }
          }
        } catch (e) {
          console.error(`Failed to auto-refresh ${type} session`, e);
        }
      } else {
        // Fallback: check if session token exists (manually set or from older login)
        // If token exists, we consider them authenticated for now, but ideally we want to refresh.
        // If no credentials strictly required, we just check existence.
        if (localStorage.getItem(`${type}_session`)) {
          if (type === "dac") setDacAuthenticated(true);
          if (type === "datasource") setDataSourceAuthenticated(true);
        }
      }
    };

    // Execute concurrently
    Promise.all([refreshSession("dac"), refreshSession("datasource")]).finally(
      () => {
        setIsLoading(false);
        // Load Usernames
        const dacCache = localStorage.getItem("login_cache_dac");
        if (dacCache) {
          try {
            const { username } = JSON.parse(dacCache);
            setDacUsername(username || "");
          } catch (e) {}
        }
        const dsCache = localStorage.getItem("login_cache_datasource");
        if (dsCache) {
          try {
            const { username } = JSON.parse(dsCache);
            setDataSourceUsername(username || "");
          } catch (e) {}
        }
      },
    );
  }, []);

  // Fetch Data when authenticated
  useEffect(() => {
    if (dacAuthenticated && dataSourceAuthenticated) {
      fetchScrapedData();
    }
  }, [dacAuthenticated, dataSourceAuthenticated]);

  // Navigate/Auto-select Logic
  useEffect(() => {
    if (sheetData.length > 0) {
      if (currentTaskIndex < sheetData.length) {
        handleSelectItem(sheetData[currentTaskIndex]);
        // Reset Form
        setEvaluationForm(defaultEvaluationValues); // Removed constant default
        // Logic to reset form based on current options will be handled in useEffect or Sidebar
        setCustomReason("");
        setSnBapp(sheetData[currentTaskIndex].serial_number);
        setEnableManualNote(false);
      } else {
        setSelectedSn(null);
        setParsedData(null);
      }
    }

    // Fetch Sidebar Options if not loaded
    if (sheetData.length > 0 && sidebarOptions.length === 0) {
      fetchSidebarOptions(); // This will also init the form
    }
  }, [sheetData, currentTaskIndex, sidebarOptions.length]); // added dependency

  // Parse HTML Effect
  useEffect(() => {
    if (rawDataHtml && currentExtractedId) {
      parseHtml(rawDataHtml, currentExtractedId);
    }
  }, [rawDataHtml, currentExtractedId]);

  // Debug: Log ID when it changes
  useEffect(() => {
    console.log("Current ID State Updated:", id);
  }, [id]);

  // Cache State
  const prefetchCache = useRef<Map<string, any>>(new Map());

  const fetchScrapedData = async () => {
    const dsSession = localStorage.getItem("datasource_session");
    // We can filter by username/verifikator if needed, but for now grab all or server filters
    // const username = localStorage.getItem('username');

    if (!dsSession) return;

    try {
      const res = await fetch("/api/datasource/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookie: dsSession,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const filtered = json.data.filter(
          (item: any) => item.type === "Zyrex" && item.status === "PROSES",
        );

        if (
          typeof window !== "undefined" &&
          window.location.search.includes("reverse=true")
        ) {
          filtered.reverse();
        }
        console.log(filtered);
        setSheetData(filtered.reverse().slice(1, 51));
        setCurrentTaskIndex(0);
      } else {
        console.error("Failed to fetch scraped data:", json.message);
      }
    } catch (e) {
      console.error("Error fetching scraped data:", e);
    }
  };

  // Prefetch Effect
  useEffect(() => {
    if (sheetData.length > 0 && currentTaskIndex + 1 < sheetData.length) {
      const nextItem = sheetData[currentTaskIndex + 1];
      prefetchItem(nextItem);
    }
  }, [sheetData, currentTaskIndex]);

  const prefetchItem = async (item: any) => {
    const cacheKey = `${item.npsn}_${item.no_bapp}`;
    if (prefetchCache.current.has(cacheKey)) return;

    const currentSessionId = localStorage.getItem("dac_session");
    try {
      const res = await fetch("/api/get-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npsn: item.npsn,
          session_id: currentSessionId,
          no_bapp: item.no_bapp,
        }),
      });

      const json = await res.json();
      if (json.success) {
        const { summary, awb, comments, extractedId } = json.data;

        // Image Preloading Logic
        const photoList = awb.ListPhotoJSON || {};
        const imageUrls = Object.keys(photoList)
          .filter((key) => photoList[key])
          .map((key) => photoList[key]);

        if (awb.SignatureURL) imageUrls.push(awb.SignatureURL);

        // Extract images from extracted HTML if available
        // Note: parsing HTML here just for images might be expensive,
        // relying mainly on API data for preloading is safer/faster.

        console.log(`Prefetching images for ${item.npsn}:`, imageUrls.length);

        imageUrls.forEach((url: string) => {
          const img = new Image();
          img.src = url;
        });

        prefetchCache.current.set(cacheKey, json);
      }
    } catch (err) {
      console.error("Prefetch error:", err);
    }
  };

  const handleSelectItem = async (item: any) => {
    // Avoid re-fetching if data is already loaded and matches
    if (
      parsedData &&
      parsedData.school.npsn === item.npsn &&
      parsedData.item.serial_number === item.serial_number
    ) {
      return;
    }

    setCurrentImageIndex(null); // Reset image viewer
    // Note: parsedData(null) removed here to prevent flash if cache hits

    const cacheKey = `${item.npsn}_${item.no_bapp}`;
    const currentSessionId = localStorage.getItem("dac_session");

    // Check cache first
    if (prefetchCache.current.has(cacheKey)) {
      console.log("Using cached data for", item.npsn);
      const json = prefetchCache.current.get(cacheKey);
      setParsedDataFromJSON(json, item); // Extracted helper
      // No loading state needed
    } else {
      // Miss: Fetch manually
      setParsedData(null); // Clear old data only on cache miss
      setDetailLoading(true);

      try {
        const res = await fetch("/api/get-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npsn: item.npsn,
            session_id: currentSessionId,
            no_bapp: item.no_bapp,
          }),
        });
        const json = await res.json();
        setParsedDataFromJSON(json, item);
      } catch (err) {
        console.error("Gagal menarik data detail Zyrex:", err);
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const setParsedDataFromJSON = (json: any, item: any) => {
    if (json.success) {
      const { summary, awb, comments, extractedId } = json.data;
      const lastHistory = awb.History.at(-1);
      const fetchedDate =
        lastHistory && lastHistory.date
          ? lastHistory.date.substring(0, 10) // Mengambil "2026-01-07"
          : new Date().toISOString().split("T")[0];
      setSnBapp(awb.OrderID);
      // Mapping Foto dari ListPhotoJSON
      const photoList = awb.ListPhotoJSON || {};
      const mappedImages = Object.keys(photoList)
        .filter((key) => photoList[key]) // Hanya ambil yang ada URL-nya
        .map((key) => ({
          src: photoList[key],
          title: key.toUpperCase(),
        }));
      setVerificationDate(fetchedDate);
      // Jika Signature & Photo utama tidak masuk di ListPhotoJSON, tambahkan manual
      if (awb.SignatureURL)
        mappedImages.push({ src: awb.SignatureURL, title: "SIGNATURE" });
      const historyComments = (comments || []).map((c: any) => ({
        date: c.CreatedAt,
        status: "REVISI/DITOLAK",
        user: c.commenter_name || "Verifier",
        note: c.comment,
      }));
      setSelectedSn(awb.OrderID);
      setParsedData({
        school: {
          npsn: summary.npsn || "-",
          nama_sekolah: summary.school_name || "-",
          kabupaten: summary.kabupaten || "-",
          provinsi: summary.provinsi || "-",
          alamat: awb.ActualReceiverAddress || "-",
        },
        item: {
          serial_number: awb.OrderID || "-",
          nama_barang: summary.school_name || "-",
        },
        images: mappedImages,
        // Gabungkan riwayat logistik (AWB) dan riwayat approval (Comment) jika perlu
        // Di sini kita tampilkan riwayat logistik dari awb.History
        history: [...historyComments],
        extractedId: extractedId,
        resi: awb.ConnoteNumber || summary.nomor_resi,
        bapp_id: summary.bapp_id,
        bapp_date: fetchedDate,
      });
    }
  };
  const parseHtml = (html: string, initialExtractedId: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Helper to get input value by label
    const getValueByLabel = (labelText: string): string => {
      const labels = Array.from(doc.querySelectorAll("label"));
      const targetLabel = labels.find((l) =>
        l.textContent?.trim().includes(labelText),
      );
      if (targetLabel && targetLabel.parentElement) {
        const input =
          targetLabel.parentElement.querySelector("input, textarea");
        if (input) {
          return (
            (input as HTMLInputElement).value ||
            input.getAttribute("value") ||
            ""
          );
        }
      }
      return "";
    };

    const school: Record<string, string> = {
      npsn: getValueByLabel("NPSN"),
      nama_sekolah: getValueByLabel("Nama Sekolah"),
      alamat: getValueByLabel("Alamat"),
      kecamatan: getValueByLabel("Kecamatan"),
      kabupaten: getValueByLabel("Kabupaten"),
      provinsi: getValueByLabel("Provinsi"),
      pic: "N/A",
    };

    const item: Record<string, string> = {
      serial_number: getValueByLabel("Serial Number"),
      nama_barang: getValueByLabel("Nama Barang"),
    };

    let resi = getValueByLabel("No. Resi");
    if (!resi) resi = getValueByLabel("No Resi");
    if (!resi) {
      const bodyText = doc.body.textContent || "";
      const resiMatch = bodyText.match(/No\.?\s*Resi\s*[:\n]?\s*([A-Z0-9]+)/i);
      if (resiMatch) resi = resiMatch[1];
    }

    const approvalBtn = doc.querySelector('button[onclick*="approvalFunc"]');
    const htmlId = approvalBtn?.getAttribute("data-id");

    const imgs: Array<{ src: string; title: string }> = [];
    const imageCards = doc.querySelectorAll(".card .card-body .col-6");
    imageCards.forEach((card) => {
      const header = card.querySelector(".card-header");
      const img = card.querySelector("img");
      if (img) {
        imgs.push({
          title: header?.textContent?.trim() || "Dokumentasi",
          src: img.getAttribute("src") || "",
        });
      }
    });
    // Ekstraksi Log Approval
    const logs: ApprovalLog[] = [];
    const logContainer = doc.querySelector("#logApproval .accordion-body");

    if (logContainer) {
      // Berdasarkan struktur HTML admin dashboard biasanya (border rounded p-3 mb-2)
      const logEntries = logContainer.querySelectorAll(".border.rounded");

      logEntries.forEach((entry) => {
        const noteElement = entry.querySelector(".mt-2.small"); // Ini adalah div yang berisi tulisan "Catatan:"
        const actualNoteText =
          noteElement?.nextElementSibling?.textContent?.trim() || "-";
        logs.push({
          date: entry.querySelector(".text-muted")?.textContent?.trim() || "",
          status: entry.querySelector(".fw-bold")?.textContent?.trim() || "",
          user:
            entry
              .querySelector(".fw-semibold")
              ?.textContent?.replace("User:", "")
              .trim() || "",
          note: actualNoteText || " - ",
        });
      });
    }

    setParsedData({
      school,
      item,
      images: imgs,
      history: logs,
      extractedId: htmlId || initialExtractedId,
      resi: resi || "-",
      bapp_id: "",
      bapp_date: "",
    });
  };

  const fetchSidebarOptions = async () => {
    if (sheetData.length === 0) return;
    const item = sheetData[0]; // Use first item to scrape options
    const dsSession = localStorage.getItem("datasource_session");

    // We need action_id to fetch the form
    if (!item.action_id || !dsSession) {
      console.warn("Missing action_id or session for fetching sidebar options");
      return;
    }

    try {
      const res = await fetch("/api/get-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.action_id,
          cookie: dsSession,
        }),
      });
      const json = await res.json();

      if (json.success && json.html) {
        setId(json.id_user);
        parseSidebarOptions(json.html, json.id_user);
      } else {
        console.error("Failed to fetch form HTML:", json.message);
      }
    } catch (e) {
      console.error("Failed to fetch sidebar options", e);
    }
  };

  const parseSidebarOptions = (html: string, preloadedIdUser: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const fieldMapping: Omit<EvaluationField, "options">[] = [
      { id: "H", label: "FOTO SEKOLAH/PAPAN NAMA", name: "f_papan_identitas" },
      { id: "I", label: "FOTO BOX & PIC", name: "f_box_pic" },
      { id: "J", label: "FOTO KELENGKAPAN UNIT", name: "f_unit" },
      { id: "K", label: "DXDIAG", name: "spesifikasi_dxdiag" },
      { id: "O", label: "BARCODE SN BAPP", name: "bc_bapp_sn" },
      { id: "Q", label: "BAPP HAL 1", name: "bapp_hal1" },
      { id: "R", label: "BAPP HAL 2", name: "bapp_hal2" },
      { id: "S", label: "TTD BAPP", name: "nm_ttd_bapp" },
      { id: "T", label: "STEMPEL", name: "stempel" },
      { id: "G", label: "GEO TAGGING", name: "geo_tag" },
      { id: "F", label: "TGL BAPP", name: "ket_tgl_bapp" },
    ];

    const newOptions: EvaluationField[] = [];
    const newDefaults: Record<string, string> = {};

    fieldMapping.forEach((field) => {
      const select = doc.querySelector(`select[name="${field.name}"]`);
      const opts: string[] = [];
      if (select) {
        // Find optgroups/options. The dump shows options inside optgroup
        const options = select.querySelectorAll("option");
        options.forEach((opt) => {
          const val = opt.value;
          if (val && val.trim() !== "") {
            opts.push(val);
          }
        });
      }

      // Fallback if no options found? Or maybe keep empty?
      if (opts.length > 0) {
        newOptions.push({ ...field, options: opts });
        newDefaults[field.id] = opts[0];
      } else {
        newOptions.push({
          ...field,
          options: ["Sesuai", "Tidak Sesuai", "Tidak Ada"],
        }); // Fallback
        newDefaults[field.id] = "Sesuai";
      }
    });

    setSidebarOptions(newOptions);
    setEvaluationForm(newDefaults);
  };
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (currentImageIndex === null || !parsedData) return;

      if (e.key === "Escape" || e.key === " ") setCurrentImageIndex(null);
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") nextImage();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") prevImage();

      // Logika Rotasi 90 derajat
      if (e.key.toLowerCase() === "q") rotateImage("left");
      if (e.key.toLowerCase() === "e") rotateImage("right");
    };

    const handleMouse = (e: MouseEvent) => {
      if (currentImageIndex === null || !parsedData) return;
      if (e.button === 3) {
        e.preventDefault();
        prevImage();
      }
      if (e.button === 4) {
        e.preventDefault();
        nextImage();
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleMouse);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleMouse);
    };
  }, [currentImageIndex, parsedData]);

  const submitToDataSource = async (isApproved: boolean) => {
    // Prevent double clicking
    if (isSubmitting) return;

    const session = localStorage.getItem("datasource_session");
    if (!session || !parsedData || sheetData.length === 0) return;

    const currentItem = sheetData[currentTaskIndex];

    // 1. Disable Buttons Immediately
    setIsSubmitting(true);

    // 2. Prepare Payload
    // sn_bapp Logic:
    const barcodeSnStatus = evaluationForm["O"];
    let finalSnBapp = snBapp;
    if (barcodeSnStatus === "Ada" || barcodeSnStatus === "Sesuai") {
      finalSnBapp = currentItem.serial_number;
    }

    const payload: Record<string, string> = {
      id_user: id,
      npsn: currentItem.npsn,
      sn_penyedia: currentItem.serial_number,
      cek_sn_penyedia: currentItem.cek_sn_penyedia,
      id_update: currentItem.action_id,
      no_bapp: currentItem.bapp,
      ket_tgl_bapp: evaluationForm["F"],
      tgl_bapp: verificationDate,
      sn_bapp: finalSnBapp,
      geo_tag: evaluationForm["G"],
      f_papan_identitas: evaluationForm["H"],
      f_box_pic: evaluationForm["I"],
      f_unit: evaluationForm["J"],
      spesifikasi_dxdiag: evaluationForm["K"],
      bc_bapp_sn: evaluationForm["O"],
      bapp_hal1: evaluationForm["Q"],
      bapp_hal2: evaluationForm["R"],
      nm_ttd_bapp: evaluationForm["S"],
      stempel: evaluationForm["T"],
    };

    // 3. Branching Logic
    if (enableManualNote) {
      // SLOW PATH: Wait for result, then show Modal
      // We await this so the UI stays "loading" until the modal is ready
      await handleSubmissionProcess(
        session,
        payload,
        currentItem,
        parsedData,
        true, // shouldWaitUser
      );
      setIsSubmitting(false); // Re-enable UI for Modal interaction
    } else {
      // FAST PATH: Optimistic Update
      // Fire and forget the background process
      handleSubmissionProcess(
        session,
        payload,
        currentItem,
        parsedData,
        false, // shouldWaitUser
      );

      // Optimistic Skip
      handleSkip(false);

      // Re-enable buttons after short delay
      setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }
  };

  const handleSubmissionProcess = async (
    session: string,
    payload: any,
    item: any,
    currentParsedData: ExtractedData,
    shouldWaitUser: boolean,
  ) => {
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const res = await fetch("/api/datasource/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload, cookie: session }),
        });

        const json = await res.json();
        if (json.success) {
          if (shouldWaitUser) {
            console.log(`Submitted ${item.npsn} (Manual Note Flow)`);
          } else {
            console.log(`Submitted ${item.npsn} (Background)`);
          }
          // Break loop on success
          break;
        } else {
          // Failure response from server
          console.error(`Submit Failed (Attempt ${attempt}):`, json.message);
          if (shouldWaitUser) {
            // Optional: notify user it's retrying? For now, we just retry silently or log.
            console.log("Retrying in 2 seconds...");
          }
          // Delay before retry
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
      } catch (e) {
        console.error(`Submit Process Error (Attempt ${attempt}):`, e);
        // Delay before retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
    }

    // Process Post-Success Logic (extracted from original success block)
    try {
      let finalNote = "";

      // Only fetch view-form if needed (e.g. for rejected items or logging)
      try {
        const viewRes = await fetch("/api/datasource/view-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.action_id,
            cookie: session,
          }),
        });
        const viewJson = await viewRes.json();
        if (viewJson.success && viewJson.html) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(viewJson.html, "text/html");

          const descInput = doc.querySelector(
            'textarea[name="description"]',
          ) as HTMLTextAreaElement;
          if (descInput) {
            finalNote = descInput.value || descInput.textContent || "";
          }

          const alerts = Array.from(
            doc.querySelectorAll(".alert.alert-danger"),
          );
          const isPihakPertamaError = alerts.some((alert) =>
            /Pihak pertama/i.test(alert.textContent || ""),
          );

          if (isPihakPertamaError) {
            const pihakPertamaNote =
              "(1AN) Pihak pertama hanya boleh dari kepala sekolah/wakil kepala sekolah/guru/pengajar/operator sekolah";
            if (finalNote.length > 0) {
              finalNote = `${finalNote} ${pihakPertamaNote}`;
            } else {
              finalNote = pihakPertamaNote;
            }
          }
        }
      } catch (err) {
        console.error("Error fetching view form in process", err);
      }

<<<<<<< Updated upstream
      // DAC Session Refresh Logic
      let currentDacSession = localStorage.getItem("dac_session");
      const storedDac = localStorage.getItem("login_cache_dac");
      if (storedDac) {
        try {
          const { username: dacUser, password: dacPass } =
            JSON.parse(storedDac);
          if (dacUser && dacPass) {
            const loginRes = await fetch("/api/auth/login", {
=======
        // DAC Session Refresh Logic
        let currentDacSession = localStorage.getItem("dac_session");
        const storedDac = localStorage.getItem("login_cache_dac");
        if (storedDac) {
          try {
            const { username: dacUser, password: dacPass } =
              JSON.parse(storedDac);
            if (dacUser && dacPass) {
              const loginRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username: dacUser,
                  password: dacPass,
                  type: "dac",
                }),
              });
              const loginJson = await loginRes.json();
              if (loginJson.success) {
                let pureToken = loginJson.data?.token;
                if (!pureToken && loginJson.cookie) {
                  const match = loginJson.cookie.match(/token=([^;]+)/);
                  pureToken = match ? match[1] : loginJson.cookie;
                }
                if (pureToken) {
                  localStorage.setItem("dac_session", pureToken);
                  currentDacSession = pureToken;
                }
              }
            }
          } catch (ignore) {}
        }

        if (currentDacSession && currentParsedData.extractedId) {
          const approvalPayload = {
            status: finalNote.length > 0 ? "rejected" : "approved",
            id: currentParsedData.extractedId,
            note: finalNote,
            session_id: currentDacSession,
            bapp_id: currentParsedData.bapp_id || "",
            bapp_date: formatToDacISO(verificationDate),
          };

          if (shouldWaitUser) {
            // MANUAL FLOW: Update State & Show Modal
            setPendingApprovalData(approvalPayload);
            setManualNote(finalNote);
            setShowNoteModal(true);
          } else {
            // BACKGROUND FLOW: Save Immediately
            await fetch("/api/save-approval", {
>>>>>>> Stashed changes
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: dacUser,
                password: dacPass,
                type: "dac",
              }),
            });
            const loginJson = await loginRes.json();
            if (loginJson.success) {
              let pureToken = loginJson.data?.token;
              if (!pureToken && loginJson.cookie) {
                const match = loginJson.cookie.match(/token=([^;]+)/);
                pureToken = match ? match[1] : loginJson.cookie;
              }
              if (pureToken) {
                localStorage.setItem("dac_session", pureToken);
                currentDacSession = pureToken;
              }
            }
          }
        } catch (ignore) { }
      }

      if (currentDacSession && currentParsedData.extractedId) {
        const approvalPayload = {
          status: finalNote.length > 0 ? "rejected" : "approved",
          id: currentParsedData.extractedId,
          note: finalNote,
          session_id: currentDacSession,
          bapp_id: currentParsedData.bapp_id || "",
          bapp_date: formatToDacISO(verificationDate),
        };

        if (shouldWaitUser) {
          // MANUAL FLOW: Update State & Show Modal
          setPendingApprovalData(approvalPayload);
          setManualNote(finalNote);
          setShowNoteModal(true);
        } else {
          // BACKGROUND FLOW: Save Immediately
          await fetch("/api/save-approval", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(approvalPayload),
          }).catch((err) => console.error("Background DAC Save Error", err));
        }
      }
    } catch (err) {
      console.error("Error in post-submit logic:", err);
    }
  };
  const executeSaveApproval = async (payload: any) => {
    try {
      const res = await fetch("/api/save-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("Saved to DAC");
      return await res.json();
    } catch (dacErr) {
      console.error("Failed to save to DAC", dacErr);
      alert("Gagal menyimpan ke DAC");
    }
  };

  const handleConfirmManualNote = async () => {
    if (!pendingApprovalData) return;

    const updatedPayload = {
      ...pendingApprovalData,
      note: manualNote, // Gunakan catatan yang sudah diedit user
    };

    await executeSaveApproval(updatedPayload);
    setShowNoteModal(false);
    setPendingApprovalData(null);
    handleSkip(false); // Pindah ke task berikutnya setelah sukses
  };
  // Effect untuk mengecek Double Data (NPSN Ganda)
  // useEffect(() => {
  //   const checkDoubleData = async () => {
  //     // Pastikan parsedData sudah ada dan memiliki NPSN
  //     if (!parsedData?.school?.npsn) return;

  //     const currentSessionId = localStorage.getItem("dac_session");
  //     if (!currentSessionId) return;

  //     try {
  //       const res = await fetch("/api/check-double-data", {
  //         method: "POST",
  //         headers: { "Content-Type": "application/json" },
  //         body: JSON.stringify({
  //           term: parsedData.school.npsn, // Mengirim NPSN sebagai term
  //           session_id: currentSessionId,
  //         }),
  //       });

  //       const json = await res.json();

  //       if (json.success && Array.isArray(json.data)) {
  //         // Jika data yang dikembalikan lebih dari 1, tampilkan alert
  //         if (json.data.length > 1) {
  //           const snList = json.data
  //             .map((d: any) => d.serial_number)
  //             .join(", ");

  //           alert(
  //               `PERINGATAN: Terdeteksi ${json.data.length} data untuk NPSN: ${parsedData.school.npsn}.\n\n` +
  //               `Daftar SN yang terdaftar:\n${snList}\n\n` +
  //               `Harap teliti kembali sebelum melakukan approval.`,
  //           );
  //         }
  //       }
  //     } catch (err) {
  //       console.error("Gagal mengecek double data:", err);
  //     }
  //   };

  //   checkDoubleData();
  // }, [parsedData?.school?.npsn]); // Hanya berjalan ketika NPSN pada parsedData berubah

  // Effect untuk Keyboard dan Mouse Macro di Image Viewer
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (currentImageIndex === null || !parsedData) return;

      // ... logika keyboard yang sudah ada (Esc, Panah, Q, E) ...
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key.toLowerCase() === "q") rotateImage("left");
      if (e.key.toLowerCase() === "e") rotateImage("right");
    };

    // LOGIKA MOUSE MACRO (Tombol Samping)
    const handleMouse = (e: MouseEvent) => {
      if (currentImageIndex === null || !parsedData) return;

      // Tombol 3 biasanya 'Back' (Macro Down), Tombol 4 biasanya 'Forward' (Macro Up)
      // Beberapa mouse mendeteksi button 3 dan 4 sebagai tombol navigasi
      if (e.button === 3) {
        // Mouse Back / Down
        e.preventDefault(); // Mencegah browser kembali ke halaman sebelumnya
        prevImage();
      } else if (e.button === 4) {
        // Mouse Forward / Up
        e.preventDefault(); // Mencegah browser maju ke halaman berikutnya
        nextImage();
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleMouse); // Tambahkan listener mouse

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleMouse);
    };
  }, [currentImageIndex, parsedData]);
  // Fungsi untuk ke gambar berikutnya
  const nextImage = () => {
    if (parsedData) {
      setCurrentImageIndex((p) => (p! + 1) % parsedData.images.length);
      setImageRotation(0); // Reset rotasi saat pindah gambar
    }
  };

  // Fungsi untuk ke gambar sebelumnya
  const prevImage = () => {
    if (parsedData) {
      setCurrentImageIndex(
        (p) => (p! - 1 + parsedData.images.length) % parsedData.images.length,
      );
      setImageRotation(0); // Reset rotasi saat pindah gambar
    }
  };
  const handleDacLoginSuccess = (data: {
    cookie: string;
    username: string;
  }) => {
    localStorage.setItem("dac_session", data.cookie);
    localStorage.setItem("username", data.username);
    setDacAuthenticated(true);
  };

  const handleDataSourceLoginSuccess = (data: {
    cookie: string;
    username: string;
  }) => {
    localStorage.setItem("datasource_session", data.cookie);
    setDataSourceAuthenticated(true);
  };

  const handleTerima = async () => {
    await submitToDataSource(true);
  };
  const handleTolak = async () => {
    // const note = customReason || 'Ditolak';
    await submitToDataSource(false);
  };
  const handleSkip = (skipped: boolean) => {
    const nextIndex = currentTaskIndex + 1;
    if (nextIndex < sheetData.length) {
      const nextItem = sheetData[nextIndex];

      // OPTIMISTIC PRE-UPDATE
      // 1. Reset Form & UI States
      setEvaluationForm(defaultEvaluationValues);
      setCustomReason("");
      setSnBapp(nextItem.serial_number);
      setEnableManualNote(false);
      setCurrentImageIndex(null);

      // 2. Data Swap (Immediate)
      const cacheKey = `${nextItem.npsn}_${nextItem.no_bapp}`;
      if (prefetchCache.current.has(cacheKey)) {
        const json = prefetchCache.current.get(cacheKey);
        setParsedDataFromJSON(json, nextItem);
      } else {
        setParsedData(null);
      }

      // 3. Move Index
      setCurrentTaskIndex((prev) => prev + 1);
    } else {
      // End of list
      setCurrentTaskIndex((prev) => prev + 1);
      setParsedData(null);
      setSelectedSn(null);
    }
  };

  const rotateImage = (dir: "left" | "right") =>
    setImageRotation((p) => (dir === "right" ? p + 45 : p - 45));

  const handleRefetch = async () => {
    if (sheetData.length === 0) return;
    const item = sheetData[currentTaskIndex];
    if (!item) return;

    // Force fetch, ignoring cache check
    setDetailLoading(true);
    const currentSessionId = localStorage.getItem("dac_session");

    try {
      const res = await fetch("/api/get-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npsn: item.npsn,
          session_id: currentSessionId,
          no_bapp: item.no_bapp,
        }),
      });
      const json = await res.json();

      // Update Cache
      const cacheKey = `${item.npsn}_${item.no_bapp}`;
      prefetchCache.current.set(cacheKey, json);

      // Update UI
      setParsedDataFromJSON(json, item);
    } catch (err) {
      console.error("Refetch error:", err);
      alert("Gagal melakukan refetch data.");
    } finally {
      setDetailLoading(false);
    }
  };

  if (isLoading)
    return (
      <div className="flex h-screen items-center justify-center dark:text-white">
        Loading...
      </div>
    );

  if (!dacAuthenticated) {
    return (
      <Login
        title="Login DAC"
        loginType="dac"
        onLoginSuccess={handleDacLoginSuccess}
      />
    );
  }

  if (!dataSourceAuthenticated) {
    return (
      <Login
        title="Login ASSHAL.TECH"
        loginType="datasource"
        onLoginSuccess={handleDataSourceLoginSuccess}
      />
    );
  }
  const formatToDacISO = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    // Gunakan jam, menit, detik saat ini
    date.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

    const iso = date.toISOString();
    // Ganti milidetik dengan mikrodetik dan timezone +07:00
    return iso.replace(/\.\d{3}Z$/, ".477893+07:00");
  };
  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-black overflow-hidden relative">
      {/* Main Content */}
      <div
        className={`flex-1 h-full overflow-hidden relative bg-zinc-50/50 dark:bg-zinc-900/50 ${
          sidebarPosition === "left" ? "order-2" : "order-1"
        }`}
      >
        <div className="h-full overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {parsedData && !detailLoading ? (
            <div className="max-w-5xl mx-auto flex flex-col gap-6">
              {/* Header Info Parsed */}
              <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b dark:border-zinc-700 pb-2">
                  Informasi Sekolah
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
                  <InfoItem label="NPSN" value={parsedData.school.npsn} />
                  <InfoItem
                    label="Nama Sekolah"
                    value={parsedData.school.nama_sekolah}
                  />
                  <InfoItem
                    label="Kecamatan"
                    value={parsedData.school.kecamatan}
                  />
                  <InfoItem
                    label="Kabupaten/Kota"
                    value={parsedData.school.kabupaten}
                  />
                  <InfoItem
                    label="Provinsi"
                    value={parsedData.school.provinsi}
                  />
                  <InfoItem
                    label="Alamat"
                    value={parsedData.school.alamat}
                    full
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b dark:border-zinc-700 pb-2">
                  Data Barang
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                  <InfoItem
                    label="Nama Barang"
                    value={parsedData.item.nama_barang}
                  />
                  <InfoItem
                    label="Serial Number"
                    value={parsedData.item.serial_number}
                  />
                </div>
              </div>
              {/* Log Approval Section */}
              <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b dark:border-zinc-700 pb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  Riwayat Approval
                </h2>

                {parsedData.history.length > 0 ? (
                  <div className="space-y-3">
                    {parsedData.history.map((log, idx) => (
                      <div
                        key={idx}
                        className={`border dark:border-zinc-700 rounded-lg p-4 dark:bg-zinc-900/30 ${
                          log.status.toLowerCase().includes("setuju") ||
                          log.status.toLowerCase().includes("terima")
                            ? "bg-green-100"
                            : "bg-red-100"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs text-zinc-500 font-mono">
                            {log.date}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              log.status.toLowerCase().includes("setuju") ||
                              log.status.toLowerCase().includes("terima")
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                        {log.user && (
                          <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                            Oleh: {log.user}
                          </div>
                        )}
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 italic">
                          <span className="font-medium not-italic">
                            Catatan:
                          </span>{" "}
                          {log.note}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-zinc-400 text-sm italic">
                    Belum ada riwayat approval untuk item ini.
                  </div>
                )}
              </div>
              {/* Image Gallery */}
              <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5">
                <div className="flex justify-between items-center mb-4 border-b dark:border-zinc-700 pb-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    Dokumentasi Pengiriman
                  </h2>
                  <button
                    onClick={handleRefetch}
                    className="px-3 py-1 text-xs font-bold bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded text-zinc-700 dark:text-zinc-300 transition-colors"
                    title="Reload Data & Gambar"
                  >
                    ↻ Refetch
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {parsedData.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="group relative cursor-pointer"
                      onClick={() => {
                        setCurrentImageIndex(idx);
                        setImageRotation(0);
                      }}
                    >
                      <div className="aspect-square w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900">
                        <img
                          src={img.src}
                          alt={img.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium text-center text-zinc-600 dark:text-zinc-400 truncate">
                        {img.title}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center flex-col gap-4 text-zinc-500">
              {detailLoading
                ? "Loading task data..."
                : sheetData.length === 0
                  ? "Fetching task list..."
                  : "All tasks completed!"}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div
        className={`flex-shrink-0 h-full ${
          sidebarPosition === "left"
            ? "order-1 border-r border-zinc-700"
            : "order-2 border-l border-zinc-700"
        }`}
      >
        <Sidebar
          pendingCount={sheetData.length - currentTaskIndex}
          handleTerima={handleTerima}
          handleTolak={handleTolak}
          handleSkip={handleSkip}
          isSubmitting={isSubmitting}
          evaluationForm={evaluationForm}
          setEvaluationForm={setEvaluationForm}
          customReason={customReason}
          setCustomReason={setCustomReason}
          sidebarOptions={sidebarOptions}
          currentImageIndex={currentImageIndex}
          snBapp={snBapp}
          setSnBapp={setSnBapp}
          position={sidebarPosition}
          setPosition={handleSetSidebarPosition}
          enableManualNote={enableManualNote}
          setEnableManualNote={setEnableManualNote}
          dacUsername={dacUsername}
          dataSourceUsername={dataSourceUsername}
          currentItemSn={sheetData[currentTaskIndex]?.serial_number}
        />
      </div>

      {/* Layout for Image Viewer Modal */}
      {currentImageIndex !== null && parsedData && (
        <div>
          <StickyInfoBox
            schoolData={parsedData.school}
            itemData={parsedData.item}
            history={parsedData.history}
            date={verificationDate}
            setDate={setVerificationDate}
          />

          <div
            className={`absolute top-0 bottom-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm transition-all duration-300 ${
              sidebarPosition === "left" ? "left-96 right-0" : "left-0 right-96"
            }`}
            onClick={() => setCurrentImageIndex(null)}
          >
            {/* Sticky Info */}

            {/* Toolbar */}
            <div
              className="absolute top-4 right-4 z-[60] flex gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => rotateImage("left")}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full font-bold transition-colors"
              >
                ↺
              </button>
              <button
                onClick={() => rotateImage("right")}
                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full font-bold transition-colors"
              >
                ↻
              </button>
              <button
                onClick={() => setCurrentImageIndex(null)}
                className="bg-red-500/80 hover:bg-red-600 text-white px-4 py-2 rounded-full font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Main Image Area */}
            <div
              className="flex-1 flex items-center justify-center p-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <TransformWrapper
                key={currentImageIndex + "-" + imageRotation}
                initialScale={1}
                centerOnInit
              >
                <TransformComponent
                  wrapperClass="!w-full !h-full"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  <img
                    src={parsedData.images[currentImageIndex].src}
                    alt="Preview"
                    style={{
                      transform: `rotate(${imageRotation}deg)`,
                      maxWidth: "90vw",
                      maxHeight: "85vh",
                      objectFit: "contain",
                    }}
                    className="rounded shadow-2xl transition-transform duration-200"
                  />
                </TransformComponent>
              </TransformWrapper>
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentImageIndex(
                  (currentImageIndex - 1 + parsedData.images.length) %
                    parsedData.images.length,
                );
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-6xl transition-colors p-4"
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentImageIndex(
                  (currentImageIndex + 1) % parsedData.images.length,
                );
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-6xl transition-colors p-4"
            >
              ›
            </button>

            {/* Caption */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-2 rounded-full text-white font-medium backdrop-blur-md">
              {parsedData.images[currentImageIndex].title} (
              {currentImageIndex + 1} / {parsedData.images.length})
            </div>
          </div>
        </div>
      )}
      {showNoteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-white font-bold">
                Edit Catatan Approval DAC
              </h3>
              <span
                className={`px-2 py-1 rounded text-[10px] font-bold ${
                  pendingApprovalData?.status === 2
                    ? "bg-green-900 text-green-400"
                    : "bg-red-900 text-red-400"
                }`}
              >
                {pendingApprovalData?.status === 2 ? "APPROVE" : "REJECT"}
              </span>
            </div>
            <div className="p-4">
              <label className="text-xs text-zinc-500 mb-2 block uppercase font-bold tracking-tighter">
                Catatan (Preview dari Source):
              </label>
              <textarea
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className="w-full h-48 bg-black border border-zinc-700 rounded p-3 text-sm text-zinc-200 focus:border-blue-500 outline-none font-mono"
                placeholder="Tambahkan catatan tambahan di sini..."
              />
            </div>
            <div className="p-4 bg-zinc-800/50 flex gap-2">
              <button
                onClick={() => {
                  executeSaveApproval(pendingApprovalData);
                  setShowNoteModal(false);
                  handleSkip(false);
                }}
                className="flex-1 py-2 text-zinc-400 hover:text-white transition-colors text-sm"
              >
                Lewati Edit
              </button>
              <button
                onClick={handleConfirmManualNote}
                className="flex-2 px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-sm transition-colors"
              >
                SIMPAN KE DAC
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col ${full ? "col-span-full" : ""}`}>
      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded border border-zinc-200 dark:border-zinc-700/50 block min-h-[38px]">
        {value || "-"}
      </span>
    </div>
  );
}
