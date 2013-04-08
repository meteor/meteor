#
# Meteor RPM spec file
#

Summary: Meteor platform and JavaScript application server
Vendor: Meteor
Name: meteor
Version: 0.6.0
Release: 1
License: MIT
Group: Networking/WWW
Packager: Meteor Packaging Team <contact@meteor.com>
URL: http://meteor.com/
BuildRoot: %{_tmppath}/%{name}-%{version}-root

%description
A platform and app server for building websites in JavaScript.

%prep

%build

%install
[ "%{buildroot}" != '/' ] && rm -rf %{buildroot}
if [ ! -f "%{TARBALL}" ] ; then
    echo "Can't find TARBALL: %{TARBALL}"
    exit 1
fi
install -d %{buildroot}%{_libdir}
# XXX XXX
tar -x -C %{buildroot}%{_libdir} -f %{TARBALL}
install -d %{buildroot}%{_bindir}
echo -n 'rpm' > %{buildroot}%{_libdir}/meteor/.package_stamp

%clean
[ "%{buildroot}" != '/' ] && rm -rf %{buildroot}

%files
%defattr(-,root,root)
%{_libdir}/meteor
