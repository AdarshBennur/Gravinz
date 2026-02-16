import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { apiGet } from "@/lib/api";

interface NotionColumn {
    id: string;
    name: string;
    type: string;
}

interface Schema {
    properties: NotionColumn[];
}

export interface ColumnMapping {
    email: string;
    name?: string;
    company?: string;
    role?: string;
    status?: string; // NEW - Optional
    firstEmailDate?: string; // NEW - Optional
    followup1Date?: string; // NEW - Optional
    followup2Date?: string; // NEW - Optional
    jobLink?: string; // NEW - Optional
}

interface ColumnMappingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    databaseId: string;
    onConfirm: (mapping: ColumnMapping) => void;
    existingMapping?: ColumnMapping | null;
}

export function ColumnMappingDialog({
    open,
    onOpenChange,
    databaseId,
    onConfirm,
    existingMapping,
}: ColumnMappingDialogProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [schema, setSchema] = useState<NotionColumn[]>([]);

    const [emailColumn, setEmailColumn] = useState<string>("");
    const [nameColumn, setNameColumn] = useState<string>("__NONE__");
    const [companyColumn, setCompanyColumn] = useState<string>("__NONE__");
    const [roleColumn, setRoleColumn] = useState<string>("__NONE__");
    // New optional fields
    const [statusColumn, setStatusColumn] = useState<string>("__NONE__");
    const [firstEmailDateColumn, setFirstEmailDateColumn] = useState<string>("__NONE__");
    const [followup1DateColumn, setFollowup1DateColumn] = useState<string>("__NONE__");
    const [followup2DateColumn, setFollowup2DateColumn] = useState<string>("__NONE__");
    const [jobLinkColumn, setJobLinkColumn] = useState<string>("__NONE__");

    useEffect(() => {
        if (open && databaseId) {
            fetchSchema();
        }
        // Reset on close
        if (!open) {
            setEmailColumn("");
            setNameColumn("__NONE__");
            setCompanyColumn("__NONE__");
            setRoleColumn("__NONE__");
            setStatusColumn("__NONE__");
            setFirstEmailDateColumn("__NONE__");
            setFollowup1DateColumn("__NONE__");
            setFollowup2DateColumn("__NONE__");
            setJobLinkColumn("__NONE__");
            setError(null);
        }
    }, [open, databaseId]);

    useEffect(() => {
        if (existingMapping && schema.length > 0) {
            setEmailColumn(existingMapping.email || "");
            setNameColumn(existingMapping.name || "__NONE__");
            setCompanyColumn(existingMapping.company || "__NONE__");
            setRoleColumn(existingMapping.role || "__NONE__");
            setStatusColumn(existingMapping.status || "__NONE__");
            setFirstEmailDateColumn(existingMapping.firstEmailDate || "__NONE__");
            setFollowup1DateColumn(existingMapping.followup1Date || "__NONE__");
            setFollowup2DateColumn(existingMapping.followup2Date || "__NONE__");
            setJobLinkColumn(existingMapping.jobLink || "__NONE__");
        }
    }, [existingMapping, schema]);

    const fetchSchema = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiGet<Schema>(`/api/integrations/notion/schema/${databaseId}`);
            setSchema(data.properties);

            // Auto-detect columns if no existing mapping
            if (!existingMapping) {
                autoDetectColumns(data.properties);
            }
        } catch (err: any) {
            setError(err.message || "Failed to fetch database schema");
        } finally {
            setLoading(false);
        }
    };

    const autoDetectColumns = (columns: NotionColumn[]) => {
        const nameMap: { [key: string]: string } = {};
        columns.forEach((col) => {
            const lowerName = col.name.toLowerCase();
            nameMap[lowerName] = col.name;
        });

        // Auto-detect email
        const emailCandidates = ["email", "e-mail", "contact email", "email address"];
        for (const candidate of emailCandidates) {
            if (nameMap[candidate]) {
                setEmailColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect name
        const nameCandidates = ["name", "full name", "contact", "contacted person", "contact name", "person"];
        for (const candidate of nameCandidates) {
            if (nameMap[candidate]) {
                setNameColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect company
        const companyCandidates = ["company", "organization", "org", "employer"];
        for (const candidate of companyCandidates) {
            if (nameMap[candidate]) {
                setCompanyColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect role
        const roleCandidates = ["role", "title", "position", "job title", "job role"];
        for (const candidate of roleCandidates) {
            if (nameMap[candidate]) {
                setRoleColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect status
        const statusCandidates = ["status", "email status", "contact status"];
        for (const candidate of statusCandidates) {
            if (nameMap[candidate]) {
                setStatusColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect first email date
        const firstEmailDateCandidates = ["first email date", "first email", "sent date", "initial contact"];
        for (const candidate of firstEmailDateCandidates) {
            if (nameMap[candidate]) {
                setFirstEmailDateColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect followup 1 date
        const followup1DateCandidates = ["follow-up 1 date", "followup 1 date", "followup 1", "first followup"];
        for (const candidate of followup1DateCandidates) {
            if (nameMap[candidate]) {
                setFollowup1DateColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect followup 2 date
        const followup2DateCandidates = ["follow-up 2 date", "followup 2 date", "followup 2", "second followup"];
        for (const candidate of followup2DateCandidates) {
            if (nameMap[candidate]) {
                setFollowup2DateColumn(nameMap[candidate]);
                break;
            }
        }

        // Auto-detect job link
        const jobLinkCandidates = ["job link", "url", "job url", "link", "application link"];
        for (const candidate of jobLinkCandidates) {
            if (nameMap[candidate]) {
                setJobLinkColumn(nameMap[candidate]);
                break;
            }
        }
    };

    const handleConfirm = () => {
        if (!emailColumn) {
            setError("Email column is required");
            return;
        }

        const mapping: ColumnMapping = {
            email: emailColumn,
            ...(nameColumn && nameColumn !== "__NONE__" && { name: nameColumn }),
            ...(companyColumn && companyColumn !== "__NONE__" && { company: companyColumn }),
            ...(roleColumn && roleColumn !== "__NONE__" && { role: roleColumn }),
            ...(statusColumn && statusColumn !== "__NONE__" && { status: statusColumn }),
            ...(firstEmailDateColumn && firstEmailDateColumn !== "__NONE__" && { firstEmailDate: firstEmailDateColumn }),
            ...(followup1DateColumn && followup1DateColumn !== "__NONE__" && { followup1Date: followup1DateColumn }),
            ...(followup2DateColumn && followup2DateColumn !== "__NONE__" && { followup2Date: followup2DateColumn }),
            ...(jobLinkColumn && jobLinkColumn !== "__NONE__" && { jobLink: jobLinkColumn }),
        };

        onConfirm(mapping);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Map Notion Columns</DialogTitle>
                    <DialogDescription>
                        Map your Notion database columns to contact fields. Email is required.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : (
                    <div className="grid gap-4 py-4">
                        {/* Email Column (Required) */}
                        <div className="grid gap-2">
                            <Label htmlFor="email-column">
                                Email Column <span className="text-destructive">*</span>
                            </Label>
                            <Select value={emailColumn} onValueChange={setEmailColumn}>
                                <SelectTrigger id="email-column">
                                    <SelectValue placeholder="Select email column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Name Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="name-column">Name Column (optional)</Label>
                            <Select value={nameColumn} onValueChange={setNameColumn}>
                                <SelectTrigger id="name-column">
                                    <SelectValue placeholder="Select name column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Company Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="company-column">Company Column (optional)</Label>
                            <Select value={companyColumn} onValueChange={setCompanyColumn}>
                                <SelectTrigger id="company-column">
                                    <SelectValue placeholder="Select company column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Role Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="role-column">Role Column (optional)</Label>
                            <Select value={roleColumn} onValueChange={setRoleColumn}>
                                <SelectTrigger id="role-column">
                                    <SelectValue placeholder="Select role column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="status-column">Status Column (optional)</Label>
                            <Select value={statusColumn} onValueChange={setStatusColumn}>
                                <SelectTrigger id="status-column">
                                    <SelectValue placeholder="Select status column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* First Email Date Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="first-email-date-column">First Email Date Column (optional)</Label>
                            <Select value={firstEmailDateColumn} onValueChange={setFirstEmailDateColumn}>
                                <SelectTrigger id="first-email-date-column">
                                    <SelectValue placeholder="Select first email date column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Follow-up 1 Date Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="followup1-date-column">Follow-up 1 Date Column (optional)</Label>
                            <Select value={followup1DateColumn} onValueChange={setFollowup1DateColumn}>
                                <SelectTrigger id="followup1-date-column">
                                    <SelectValue placeholder="Select follow-up 1 date column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Follow-up 2 Date Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="followup2-date-column">Follow-up 2 Date Column (optional)</Label>
                            <Select value={followup2DateColumn} onValueChange={setFollowup2DateColumn}>
                                <SelectTrigger id="followup2-date-column">
                                    <SelectValue placeholder="Select follow-up 2 date column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Job Link Column (Optional) */}
                        <div className="grid gap-2">
                            <Label htmlFor="job-link-column">Job Link Column (optional)</Label>
                            <Select value={jobLinkColumn} onValueChange={setJobLinkColumn}>
                                <SelectTrigger id="job-link-column">
                                    <SelectValue placeholder="Select job link column..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__NONE__">None</SelectItem>
                                    {schema.map((col) => (
                                        <SelectItem key={col.id} value={col.name}>
                                            {col.name} <span className="text-muted-foreground text-xs">({col.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {error && !loading && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={loading || !emailColumn}>
                        Confirm Mapping
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
