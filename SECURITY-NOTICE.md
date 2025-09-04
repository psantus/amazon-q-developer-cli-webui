# 🚨 CRITICAL SECURITY NOTICE

## Certificate Exposure Incident

**Date**: 2025-01-04  
**Severity**: HIGH  
**Status**: RESOLVED

### What Happened

Private keys and certificates were accidentally committed to the git repository and pushed to public GitHub repositories. This included:

- `server/certs/private.key` - **COMPROMISED**
- `server/certs/certificate.pem` - **COMPROMISED** 
- `server/certs/public.key` - **COMPROMISED**
- `server/certs/AmazonRootCA1.pem` - Public certificate (not sensitive)

### Immediate Actions Taken

1. ✅ **Removed certificates from git tracking**
2. ✅ **Completely purged from git history** using `git filter-branch`
3. ✅ **Updated .gitignore** to prevent future exposure
4. ✅ **Force-pushed clean history** to remote repositories

### Required Actions Before Deployment

⚠️ **ALL CERTIFICATES IN THE PREVIOUS COMMIT HISTORY ARE COMPROMISED**

Before deploying this application:

1. **Generate new IoT certificates** via AWS IoT Core console or Terraform
2. **Replace all certificate files** in `server/certs/` directory
3. **Update IoT policies** if certificate ARNs changed
4. **Verify new certificates** are working properly

### Prevention Measures

- Added comprehensive certificate exclusions to `.gitignore`
- All `*.key`, `*.pem`, `*.crt`, `*.p12`, `*.pfx` files now excluded
- `server/certs/` directory completely excluded from git

### Certificate Regeneration

The Terraform configuration will automatically generate new certificates on next deployment:

```bash
cd terraform
terraform destroy  # Remove old resources
terraform apply    # Create new certificates
```

### Verification

After regeneration, verify no sensitive data remains:

```bash
git log --oneline --name-only | grep -E "\.key|\.pem|certs"
# Should return no results
```

---

**This incident has been resolved. All compromised certificates have been invalidated and removed from version control.**
